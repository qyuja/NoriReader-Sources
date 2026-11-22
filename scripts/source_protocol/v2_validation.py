"""Schema and cross-field checks for v2 packages; no selectors or scripts run."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
import re
from urllib.parse import parse_qsl, urlsplit

from jsonschema import Draft202012Validator, FormatChecker

from .javascript import JavaScriptAnalysis
from .validation import pointer


SCHEMA_PATH = Path(__file__).resolve().parents[2] / "docs/nori-source-v2/schema.json"
HOST_PATH = Path(__file__).resolve().parents[2] / "docs/nori-source-v2/host.json"
HOST_DESCRIPTION = json.loads(HOST_PATH.read_text(encoding="utf-8"))
HOST_CAPABILITIES = set(HOST_DESCRIPTION["capabilities"])
KNOWN_CAPABILITIES = HOST_CAPABILITIES
RESULTS = {
    "catalog": "BookPage", "search": "BookPage", "detail": "DetailResult",
    "chapters": "ChapterPage", "content": "Document", "filters": "FiltersResult",
    "resolveResource": "ResolvedResource", "action": "ActionResult", "sessionCheck": "SessionStatus",
}
LIST_OPERATIONS = {"catalog", "search", "chapters"}
INPUT_KEYS = {
    "siteID", "settings", "filters", "sessionStatus", "cursor", "page", "contentKind",
    "query", "scope", "book", "edition", "chapter", "asset", "actionID", "values",
}
HEADER_NAME = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
PATH_PARAMETER = re.compile(r"\{([A-Za-z0-9][A-Za-z0-9._-]*)\}")
UNKNOWN = object()


def issue(path: str, message: str, *, stage="references", severity="error", code="invalid_definition") -> dict:
    return {"severity": severity, "stage": stage, "code": code, "path": path, "message": message}


def constant(expression):
    """Only inspect literal data, never evaluate a source expression or its steps."""
    if not isinstance(expression, dict):
        return expression
    if "literal" in expression:
        return expression["literal"]
    if "fields" in expression and not expression.get("steps"):
        values = {name: constant(child) for name, child in expression["fields"].items()}
        if any(value is UNKNOWN for value in values.values()):
            return UNKNOWN
        return {name: value for name, value in values.items() if value is not None}
    return UNKNOWN


def json_type(value) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    return "array" if isinstance(value, list) else "object"


def expression_types(expression) -> set[str] | None:
    value = constant(expression)
    if value is not UNKNOWN:
        return {json_type(value)}
    types = None
    if "fields" in expression:
        types = {"object"}
    elif "xpath" in expression:
        # XPath 1.0 can produce a scalar even with all=true; only node sets are arrays.
        types = None
    elif "each" in expression or "blocks" in expression or expression.get("all"):
        types = {"array"}
    elif "css" in expression:
        types = {"node" if expression.get("read") == "node" else "string", "null"}
    elif "regex" in expression:
        types = {"string", "null"}
    for step in expression.get("steps", []):
        result = {"toInteger": "number", "split": "array"}.get(step["op"], "string")
        types = {result, "null"}
    return types


class ResultShapes:
    """Check statically visible result fields against the same runtime model Schema."""

    def __init__(self, schema, observe=None):
        self.schema = schema
        self.observe = observe

    @staticmethod
    def source_path(expression, path: str, parts) -> str:
        if isinstance(expression, dict) and "literal" in expression:
            return path + "/literal" + pointer(parts)
        if isinstance(expression, dict) and "fields" in expression and parts:
            name, *remaining = parts
            child_path = path + "/fields" + pointer([name])
            if name in expression["fields"]:
                return ResultShapes.source_path(expression["fields"][name], child_path, remaining)
            return child_path + pointer(remaining)
        return path + pointer(parts)

    def dereference(self, definition):
        while "$ref" in definition:
            definition = self.schema["$defs"][definition["$ref"].rsplit("/", 1)[1]]
        return definition

    def check(self, expression, definition, path: str, *, injected_next=False) -> list[dict]:
        if "$ref" in definition and self.observe is not None:
            self.observe(expression, definition["$ref"].rsplit("/", 1)[1], path)
        definition = self.dereference(definition)
        if not definition:
            return []
        value = constant(expression)
        if value is not UNKNOWN:
            if injected_next and isinstance(value, dict):
                value = {**value, "next": None}
            validator = Draft202012Validator({"$defs": self.schema["$defs"], **definition}, format_checker=FormatChecker())
            return [issue(self.source_path(expression, path, list(error.absolute_path)), "常量结果不符合操作返回模型（" + error.validator + "）")
                    for error in validator.iter_errors(value)]
        if "oneOf" in definition or "anyOf" in definition:
            variants = definition.get("oneOf", definition.get("anyOf"))
            candidates = [self.check(expression, child, path, injected_next=injected_next) for child in variants]
            return min(candidates, key=len)
        types = expression_types(expression)
        expected = definition.get("type")
        expected_types = set(expected) if isinstance(expected, list) else {expected} if expected else None
        if expected_types is not None and "integer" in expected_types:
            expected_types = (expected_types - {"integer"}) | {"number"}
        if types is not None and expected_types is not None and not (types - {"null"}) & expected_types:
            return [issue(path, "表达式的静态类型与操作返回字段不匹配")]
        errors = []
        forbidden_fields = definition.get("not", {}).get("required", [])
        if forbidden_fields and "fields" in expression and all(name in expression["fields"] for name in forbidden_fields):
            errors.append(issue(path + "/fields", "此结果分支禁止声明这些字段：" + ", ".join(forbidden_fields)))
        for rule in definition.get("allOf", []):
            if "if" not in rule:
                errors += self.check(expression, rule, path)
                continue
            fields = expression.get("fields", {})
            condition_names = set(rule["if"].get("properties", {}))
            known = {name: constant(fields[name]) for name in condition_names if name in fields}
            if condition_names <= set(known) and all(value is not UNKNOWN for value in known.values()):
                condition = Draft202012Validator(rule["if"]).is_valid(known)
                errors += self.check(expression, rule.get("then" if condition else "else", {}), path)
        if "fields" in expression and not expression.get("steps"):
            fields = expression["fields"]
            for name in definition.get("required", []):
                if injected_next and name == "next":
                    continue
                if name not in fields or constant(fields[name]) is None:
                    errors.append(issue(path + "/fields" + pointer([name]), "操作返回模型缺少必填字段", code="missing_required"))
            for name, child in fields.items():
                if constant(child) is None:
                    continue  # fields omits null values, unlike a literal object.
                child_path = path + "/fields" + pointer([name])
                model = definition.get("properties", {}).get(name, definition.get("additionalProperties", {}))
                if model is False:
                    errors.append(issue(child_path, "字段不属于此操作返回模型"))
                elif isinstance(model, dict):
                    errors += self.check(child, model, child_path)
        elif "each" in expression and not expression.get("steps"):
            errors += self.check({"fields": expression["each"]["fields"]}, definition.get("items", {}), path + "/each")
        return errors


@dataclass
class PackageValidation:
    diagnostics: list[dict] = field(default_factory=list)
    checks: dict[str, str] = field(default_factory=lambda: {
        "schema": "not-run", "references": "not-run", "javascript": "not-run",
        "selectors": "not-run", "behavior": "not-run", "hostSupport": "not-checked",
    })
    capabilities: list[str] = field(default_factory=list)
    modules: list[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return not any(item["severity"] == "error" for item in self.diagnostics)


class SiteValidator:
    def __init__(self, site, path: str, root_requirements: list[str], schema, javascript: JavaScriptAnalysis):
        self.site, self.path, self.schema, self.javascript = site, path, schema, javascript
        self.errors: list[dict] = []
        self.capabilities = set(root_requirements) | set(site["requires"])
        self.endpoints = site.get("network", {}).get("endpoints", {})
        self.sessions = site.get("sessions", {})
        self.settings = {item["id"]: item for item in site.get("settings", [])}
        self.shapes = ResultShapes(schema, observe=self.known_result)
        self.managed_headers: dict[str, set[str]] = {}
        for session in self.sessions.values():
            if "credential" in session:
                self.managed_headers.setdefault(session["endpoint"], set()).add(session["credential"]["header"].lower())

    def add(self, path: str, message: str, *, severity="error"):
        self.errors.append(issue(path, message, severity=severity))

    def require(self, capability: str, path: str):
        if capability not in self.capabilities:
            self.add(path, "此声明缺少必需能力：" + capability)

    def endpoint(self, name: str, path: str):
        value = self.endpoints.get(name)
        if value is None:
            self.add(path, "端点引用不存在")
        return value

    def url(self, value: str, path: str, endpoint: str | None = None, *, base=False):
        try:
            url = urlsplit(value)
            valid = (
                url.scheme == "https"
                or url.scheme == "http" and "http-insecure-v1" in self.capabilities
            ) and bool(url.hostname) and url.username is None and url.password is None
            valid = valid and not re.search(r"[\s\\{}]", value) and (url.port is None or 1 <= url.port <= 65535)
        except ValueError:
            valid = False
        if not valid:
            self.add(path, "地址必须是无用户名、密码或模板的合法 HTTP(S) URL，并在使用 HTTP 时声明 http-insecure-v1")
            return
        if endpoint in self.endpoints and url.hostname not in self.endpoints[endpoint]["allowedHosts"]:
            self.add(path, "URL 主机未被此端点 allowedHosts 精确列出")
        if base and (url.query or url.fragment):
            self.add(path, "端点 baseURL 不能包含 query 或 fragment")

    def headers(self, values: dict, path: str, endpoint: str):
        seen = set()
        forbidden = {"cookie", "authorization", "host"} | self.managed_headers.get(endpoint, set())
        for name, value in values.items():
            location = path + pointer([name])
            if not HEADER_NAME.fullmatch(name) or name.lower() in seen:
                self.add(location, "请求头名称无效或大小写不敏感地重复")
            seen.add(name.lower())
            if name.lower() in forbidden:
                self.add(location, "此请求头由宿主凭据层管理，不能在普通 headers 中声明")
            rendered = constant(value)
            if isinstance(rendered, str) and ("\r" in rendered or "\n" in rendered):
                self.add(location, "请求头值不能包含换行")

    def controls(self, definitions: list[dict], path: str):
        previous = {}
        for index, control in enumerate(definitions):
            location = path + pointer([index])
            name = control["id"]
            if name in previous:
                self.add(location + "/id", "控件 ID 重复")
            options = [option["value"] for option in control.get("options", [])]
            if len(set(options)) != len(options):
                self.add(location + "/options", "选项值重复")
            default = control["defaultValue"]
            if control["control"] == "select" and default not in options:
                self.add(location + "/defaultValue", "默认值不属于选项")
            if control["control"] == "multiSelect" and not set(default) <= set(options):
                self.add(location + "/defaultValue", "多选默认值包含未声明选项")
            for dependency, value in control.get("when", {}).items():
                condition_path = location + "/when" + pointer([dependency])
                field = previous.get(dependency)
                if field is None:
                    self.add(condition_path, "when 只能引用同组中此前定义的控件")
                    continue
                expected = "boolean" if field["control"] == "toggle" else "string"
                if field["control"] == "multiSelect" or json_type(value) != expected:
                    self.add(condition_path, "when 值须与所引用控件的标量类型一致；不能隐式比较多选数组")
                if field["control"] == "select" and value not in [option["value"] for option in field["options"]]:
                    self.add(condition_path, "when 引用了不存在的选项值")
            previous[name] = control

    def binding(self, expression, path: str, parameters: dict, *, credentials: set[str] | None = None, operation=""):
        if not isinstance(expression, dict) or "literal" in expression:
            return
        if "setting" in expression and expression["setting"] not in self.settings:
            self.add(path + "/setting", "设置引用不存在")
        if "parameter" in expression and expression["parameter"] not in parameters:
            self.add(path + "/parameter", "路径参数引用不存在于当前 request.parameters")
        if "credential" in expression:
            if credentials is None:
                self.add(path + "/credential", "credential 只允许用于 form 会话的认证 request")
            elif expression["credential"] not in credentials:
                self.add(path + "/credential", "认证字段引用不存在")
        if "input" not in expression:
            return
        parts = [part.replace("~1", "/").replace("~0", "~") for part in expression["input"].split("/")[1:]]
        if not parts:
            return
        if parts[0] not in INPUT_KEYS:
            self.add(path + "/input", "input 引用了 SDK 未定义的顶层字段")
        elif len(parts) > 1 and parts[0] == "settings" and parts[1] not in self.settings:
            self.add(path + "/input", "input.settings 引用不存在的设置")
        elif len(parts) > 1 and parts[0] == "sessionStatus" and parts[1] not in self.sessions:
            self.add(path + "/input", "input.sessionStatus 引用不存在的会话")
        elif len(parts) > 1 and parts[0] == "filters" and operation in {"catalog", "search"}:
            filters = self.site.get("filters", {}).get(operation, [])
            if parts[1] not in {field["id"] for field in filters} and "filters" not in self.site["operations"]:
                self.add(path + "/input", "input.filters 引用未声明的筛选，且本站没有动态 filters 操作")

    def expression(self, expression, path: str, parameters: dict, response: str, *, operation="", item_kind=None, allow_nodes=False, blocks_path=None):
        self.binding(expression, path, parameters, operation=operation)
        if not isinstance(expression, dict) or "literal" in expression:
            return
        for key, capability in (("css", "css-v1"), ("xpath", "xpath-v1"), ("jsonpath", "jsonpath-v1"), ("regex", "regex-v1")):
            if key in expression:
                self.require(capability, path)
        if "css" in expression or "xpath" in expression:
            self.require("html-v1", path)
            document_scope = expression.get("scope") == "document" or item_kind is None
            if document_scope and response != "html":
                self.add(path, "文档作用域的 CSS / XPath 需要 response.format=html")
        if "jsonpath" in expression:
            self.require("json-v1", path)
            if (expression.get("scope") == "document" or item_kind is None) and response != "json":
                self.add(path, "文档作用域的 JSONPath 需要 response.format=json")
        if ("css" in expression or "xpath" in expression) and expression.get("read") == "node" and not allow_nodes:
            self.add(path, "DOM node 只能传给 each.select 或 blocks.select，不能写入 JSON 结果")
        if "script" in expression:
            self.require("script-v2", path)
            self.errors += self.javascript.check_entry(expression["script"], path + "/script", synchronous=True)
        if "fields" in expression:
            for name, child in expression["fields"].items():
                self.expression(child, path + "/fields" + pointer([name]), parameters, response,
                                operation=operation, item_kind=item_kind, blocks_path=blocks_path)
        if "each" in expression:
            each = expression["each"]
            self.expression(each["select"], path + "/each/select", parameters, response,
                            operation=operation, item_kind=item_kind, allow_nodes=True)
            types = expression_types(each["select"])
            if types is not None and "array" not in types:
                self.add(path + "/each/select", "each.select 必须返回数组；节点选择器须声明 all=true")
            selection = each["select"]
            kind = "dom" if isinstance(selection, dict) and selection.get("read") == "node" else "unknown"
            for name, child in each["fields"].items():
                self.expression(child, path + "/each/fields" + pointer([name]), parameters, response,
                                operation=operation, item_kind=kind)
        if "blocks" in expression:
            if path != blocks_path:
                self.add(path, "blocks 只允许位于 content 的 result.fields.blocks")
            block = expression["blocks"]
            if block["format"] == "html":
                self.require("html-v1", path)
            if block.get("remove"):
                self.require("css-v1", path)
            self.expression(block["select"], path + "/blocks/select", parameters, response,
                            operation=operation, item_kind=item_kind, allow_nodes=True)
            types = expression_types(block["select"])
            if types is not None and not (types - {"null"}) <= {"string", "node"}:
                self.add(path + "/blocks/select", "blocks.select 必须为文字、HTML 字符串或单个 DOM node")
            if block["format"] == "text" and types is not None and "node" in types:
                self.add(path + "/blocks/select", "format=text 需要字符串，不能直接传 DOM node")
        self.steps(expression, path)

    def steps(self, expression: dict, path: str):
        current = {key: value for key, value in expression.items() if key != "steps"}
        types = expression_types(current)
        for index, step in enumerate(expression.get("steps", [])):
            accepted = {"string", "number"} if step["op"] == "toInteger" else {"string"}
            if types is not None and (types - {"null"}) - accepted:
                self.add(path + pointer(["steps", index]), "step 的输入静态类型不匹配")
            result_type = {"toInteger": "number", "split": "array"}.get(step["op"], "string")
            types = {result_type, "null"}

    def request(self, request: dict, path: str, *, operation="", authentication: str | None = None):
        self.require("http-v1", path)
        endpoint = request["endpoint"]
        self.endpoint(endpoint, path + "/endpoint")
        parameters = request.get("parameters", {})
        credentials = {field["id"] for field in self.sessions[authentication].get("fields", [])} if authentication else None
        if "session" in request:
            session = self.sessions.get(request["session"])
            if session is None:
                self.add(path + "/session", "请求会话引用不存在")
            elif session["endpoint"] != endpoint:
                self.add(path + "/session", "会话只能用于其绑定的端点")
            if authentication and request["session"] != authentication:
                self.add(path + "/session", "认证请求不能绑定到另一个会话")
        if "path" in request:
            template = request["path"]
            remainder = PATH_PARAMETER.sub("segment", template)
            if not template.startswith("/") or template.startswith("//") or any(char in remainder for char in "{}?#\\") or re.search(r"\s", template):
                self.add(path + "/path", "path 须为根相对路径；只允许显式 {name} 参数，不接受主机、query 或 fragment")
            for name in PATH_PARAMETER.findall(template):
                if name not in parameters:
                    self.add(path + "/parameters" + pointer([name]), "path 使用了未声明参数")
                elif constant(parameters[name]) is None:
                    self.add(path + "/parameters" + pointer([name]), "路径段参数不能是 null")
        else:
            value = constant(request["url"])
            if value is not UNKNOWN:
                if not isinstance(value, str):
                    self.add(path + "/url", "静态请求 URL 必须为合法 HTTP(S) 字符串，并在使用 HTTP 时声明 http-insecure-v1")
                else:
                    self.url(value, path + "/url", endpoint)
                    try:
                        address = urlsplit(value)
                        if address.fragment:
                            self.add(path + "/url", "请求 URL 不能包含 fragment")
                        keys = {key for key, _ in parse_qsl(address.query, keep_blank_values=True)}
                        if keys & set(request.get("query", {})):
                            self.add(path + "/query", "query 与静态 URL 中的查询键重复")
                    except ValueError:
                        pass  # url() already emitted the URL diagnostic.
            self.binding(request["url"], path + "/url", parameters, credentials=credentials, operation=operation)
        for group in ("parameters", "query", "headers", "form", "json"):
            values = request.get(group, {})
            if group == "headers":
                self.headers(values, path + "/headers", endpoint)
            for name, value in values.items():
                location = path + pointer([group, name])
                self.binding(value, location, parameters, credentials=credentials, operation=operation)
                known = constant(value)
                if group != "json" and known is not UNKNOWN and isinstance(known, (list, dict)):
                    self.add(location, "此绑定最终须为标量；对象只能出现在 json 字段中")
                if group != "json" and isinstance(value, dict) and "default" in value and isinstance(value["default"], (list, dict)):
                    self.add(location + "/default", "此绑定的 default 须为标量")
        for name in parameters:
            visited = set()
            target = name
            while target in parameters and isinstance(parameters[target], dict) and "parameter" in parameters[target]:
                if target in visited:
                    self.add(path + "/parameters" + pointer([name]), "路径参数引用形成循环")
                    break
                visited.add(target)
                target = parameters[target]["parameter"]

    def checks(self, checks, path: str, parameters, response: str, operation: str):
        for index, check in enumerate(checks):
            location = path + pointer([index, "value"])
            self.expression(check["value"], location, parameters, response, operation=operation)
            types = expression_types(check["value"])
            if types is not None and types & {"object", "array", "node"}:
                self.add(location, "checks.value 必须为标量，不能使用对象或数组的真假转换")

    def operation(self, name: str, operation: dict, path: str, *, session: str | None = None):
        if "script" in operation:
            self.require("script-v2", path)
            self.errors += self.javascript.check_entry(operation["script"], path + "/script")
            return
        self.require("plan-v1", path)
        plan, location = operation["plan"], path + "/plan"
        request, response = plan["request"], plan["response"]
        parameters = request.get("parameters", {})
        self.request(request, location + "/request", operation=name)
        if session and (request.get("session") != session or request["endpoint"] != self.sessions[session]["endpoint"]):
            self.add(location + "/request", "会话 check 必须使用该会话及其绑定端点")
        if response["format"] in {"html", "json"}:
            self.require(response["format"] + "-v1", location + "/response")
        if "charset" in request and "charset" in response and request["charset"].lower() != response["charset"].lower():
            self.add(location + "/response/charset", "request 与 response 的字符集声明不一致")
        self.checks(plan.get("checks", []), location + "/checks", parameters, response["format"], name)
        result_path = location + "/result"
        blocks_path = result_path + "/fields/blocks" if name == "content" else None
        self.expression(plan["result"], result_path, parameters, response["format"], operation=name, blocks_path=blocks_path)
        self.errors += self.shapes.check(plan["result"], {"$ref": "#/$defs/" + RESULTS[name]}, result_path, injected_next=name in LIST_OPERATIONS)
        fields = plan["result"]["fields"]
        if name in LIST_OPERATIONS and "next" in fields:
            self.add(result_path + "/fields/next", "列表根 next 由 pagination 注入，不能自行构造")
        if name == "content" and isinstance(fields.get("blocks"), dict) and "blocks" in fields["blocks"] and "assets" in fields:
            self.add(result_path + "/fields/assets", "blocks 会生成并注入 assets，不能同时手写 assets")
        if (name in LIST_OPERATIONS) != ("pagination" in plan):
            self.add(location + "/pagination", "catalog / search / chapters 必须声明 pagination；其他操作禁止声明")
        if "pagination" in plan:
            pagination = plan["pagination"]
            mode = pagination["mode"]
            key = "hasMore" if mode == "page" else "next"
            if mode == "nextURL" and request["method"] != "GET":
                self.add(location + "/pagination", "nextURL 只允许用于 GET 请求")
            if key in pagination:
                next_path = location + "/pagination/" + key
                self.expression(pagination[key], next_path, parameters, response["format"], operation=name)
                types = expression_types(pagination[key])
                if mode == "page" and types is not None and types != {"boolean"}:
                    self.add(next_path, "page.hasMore 必须为真正的布尔值")
                if mode == "nextURL" and types is not None and not types <= {"string", "null"}:
                    self.add(next_path, "nextURL 必须返回 HTTP(S) 字符串或 null")
                known = constant(pagination[key])
                if mode == "nextURL" and isinstance(known, str):
                    self.url(known, next_path, request["endpoint"])
                if mode == "token" and known == "":
                    self.add(next_path, "空字符串 token 无效；结束须为 null")

    def literal_results(self, expression, definition: str, path: str):
        """Additional checks only where the complete value is statically known."""
        value = constant(expression)
        if value is UNKNOWN:
            return
        validator = Draft202012Validator({"$defs": self.schema["$defs"], "$ref": "#/$defs/" + definition}, format_checker=FormatChecker())
        if definition in {"BookPage", "ChapterPage"}:
            value = {**value, "next": None} if isinstance(value, dict) else value
        if not validator.is_valid(value):
            return
        start = len(self.errors)
        self.result_value(value, definition, "")
        for error in self.errors[start:]:
            parts = [part.replace("~1", "/").replace("~0", "~") for part in error["path"].split("/")[1:]]
            error["path"] = self.shapes.source_path(expression, path, parts)

    def known_result(self, expression, definition: str, path: str):
        """References in an explicit field map can be checked even with a dynamic URL."""
        known = constant(expression)
        if known is not UNKNOWN:
            self.literal_results(expression, definition, path)
            return
        if not isinstance(expression, dict) or "fields" not in expression or expression.get("steps"):
            return
        fields = expression["fields"]
        field_path = path + "/fields"
        values = {name: constant(child) for name, child in fields.items()}
        if definition in {"Book", "Document"} and isinstance(values.get("kind"), str) and values["kind"] not in self.site["kinds"]:
            self.add(field_path + "/kind", "kind 不属于本站声明的媒体类型")
        if definition == "Edition" and values.get("kind") == "chapters" and not {"chapters", "content"} <= set(self.site["operations"]):
            self.add(path, "chapters 版本需要本站同时提供 chapters 与 content 操作")
        if definition not in {"AssetSource", "ResolvedResource"}:
            return
        if "locator" in fields:
            if "resolveResource" not in self.site["operations"]:
                self.add(field_path + "/locator", "使用 locator 资源须声明 resolveResource 操作")
            return
        endpoint = values.get("endpoint")
        if isinstance(endpoint, str):
            self.endpoint(endpoint, field_path + "/endpoint")
        if isinstance(values.get("url"), str):
            self.url(values["url"], field_path + "/url", endpoint if isinstance(endpoint, str) else None)
        if isinstance(values.get("session"), str):
            session = self.sessions.get(values["session"])
            if session is None or isinstance(endpoint, str) and session["endpoint"] != endpoint:
                self.add(field_path + "/session", "资源会话不存在或与资源端点不一致")

    def unique(self, items, path: str, key="id"):
        seen = set()
        for index, item in enumerate(items):
            if key not in item:
                continue
            if item[key] in seen:
                self.add(path + pointer([index, key]), "同一结果集合中的 ID 重复")
            seen.add(item[key])

    def resource(self, value, path: str):
        if "locator" in value:
            if "resolveResource" not in self.site["operations"]:
                self.add(path, "使用 locator 资源须声明 resolveResource 操作")
            return
        self.endpoint(value["endpoint"], path + "/endpoint")
        self.url(value["url"], path + "/url", value["endpoint"])
        if "session" in value:
            session = self.sessions.get(value["session"])
            if session is None or session["endpoint"] != value["endpoint"]:
                self.add(path + "/session", "资源会话不存在或与资源端点不一致")

    def result_value(self, value, definition: str, path: str):
        if definition in {"BookPage", "ChapterPage"}:
            self.unique(value["items"], path + "/items")
            if definition == "BookPage":
                for index, book in enumerate(value["items"]):
                    self.result_value(book, "Book", path + pointer(["items", index]))
        elif definition == "Book":
            if value["kind"] not in self.site["kinds"]:
                self.add(path + "/kind", "书籍 kind 不属于本站声明的媒体类型")
            if "cover" in value:
                self.resource(value["cover"]["source"], path + "/cover/source")
        elif definition == "AssetSource":
            self.resource(value, path)
        elif definition == "Asset":
            self.resource(value["source"], path + "/source")
        elif definition == "Edition":
            if value["kind"] == "file":
                self.resource(value["resource"]["source"], path + "/resource/source")
            elif not {"chapters", "content"} <= set(self.site["operations"]):
                self.add(path, "chapters 版本需要本站同时提供 chapters 与 content 操作")
        elif definition == "DetailResult":
            self.result_value(value["book"], "Book", path + "/book")
            self.unique(value["editions"], path + "/editions")
            for index, edition in enumerate(value["editions"]):
                if edition["kind"] == "file":
                    self.resource(edition["resource"]["source"], path + pointer(["editions", index, "resource", "source"]))
                elif not {"chapters", "content"} <= set(self.site["operations"]):
                    self.add(path + pointer(["editions", index]), "chapters 版本需要本站同时提供 chapters 与 content 操作")
            if "chapterPage" in value:
                page = value["chapterPage"]
                if not any(edition["id"] == page["editionID"] and edition["kind"] == "chapters" for edition in value["editions"]):
                    self.add(path + "/chapterPage/editionID", "首批目录须绑定本结果中的 chapters 版本")
                self.result_value(page["page"], "ChapterPage", path + "/chapterPage/page")
        elif definition == "Document":
            if value["kind"] not in self.site["kinds"]:
                self.add(path + "/kind", "文档 kind 不属于本站声明的媒体类型")
            self.unique(value["blocks"], path + "/blocks")
            assets = value.get("assets", {})
            for key, asset in assets.items():
                location = path + pointer(["assets", key])
                if asset["id"] != key:
                    self.add(location + "/id", "Asset.id 必须与 assets 映射键一致")
                self.resource(asset["source"], location + "/source")
            for index, block in enumerate(value["blocks"]):
                location = path + pointer(["blocks", index])
                if block["kind"] == "image" and block["asset"] not in assets:
                    self.add(location + "/asset", "图片块引用了不存在的 Document.assets 资源")
                if "text" in block:
                    length = len(block["text"].encode("utf-16-le")) // 2
                    for mark_index, mark in enumerate(block.get("marks", [])):
                        if mark["start"] + mark["length"] > length:
                            self.add(location + pointer(["marks", mark_index]), "文字标记超出 text 的 UTF-16 范围")
                if "comments" in block:
                    self.resource(block["comments"]["source"], location + "/comments/source")
        elif definition == "ResolvedResource":
            self.resource(value, path)
        elif definition == "FiltersResult":
            self.controls(value["fields"], path + "/fields")

    def validate(self) -> list[dict]:
        self.controls(self.site.get("settings", []), self.path + "/settings")
        for name, controls in self.site.get("filters", {}).items():
            self.controls(controls, self.path + "/filters/" + name)
        if self.endpoints:
            self.require("http-v1", self.path + "/network")
        for name, endpoint in self.endpoints.items():
            path = self.path + pointer(["network", "endpoints", name])
            self.url(endpoint["baseURL"], path + "/baseURL", name, base=True)
            self.headers(endpoint.get("headers", {}), path + "/headers", name)
        for name, session in self.sessions.items():
            path = self.path + pointer(["sessions", name])
            self.require("auth-" + session["kind"] + "-v1", path)
            self.require("http-v1", path)
            self.endpoint(session["endpoint"], path + "/endpoint")
            if "credential" in session:
                target = session["credential"]
                if not HEADER_NAME.fullmatch(target["header"]) or target["header"].lower() in {"cookie", "host"}:
                    self.add(path + "/credential/header", "认证槽须绑定合法请求头，不能绑定 Cookie 或 Host")
                if "\n" in target.get("prefix", "") or "\r" in target.get("prefix", ""):
                    self.add(path + "/credential/prefix", "认证头前缀不能包含换行")
            if session["kind"] == "web":
                self.url(session["loginURL"], path + "/loginURL", session["endpoint"])
            else:
                self.unique(session["fields"], path + "/fields")
            if session["kind"] == "form":
                request, response = session["request"], session["response"]
                if request["method"] != "POST" or request["endpoint"] != session["endpoint"]:
                    self.add(path + "/request", "form 登录须 POST 到会话绑定的端点")
                self.request(request, path + "/request", authentication=name)
                if response["format"] in {"html", "json"}:
                    self.require(response["format"] + "-v1", path + "/response")
                if "charset" in request and "charset" in response and request["charset"].lower() != response["charset"].lower():
                    self.add(path + "/response/charset", "认证 request 与 response 的字符集声明不一致")
                parameters = request.get("parameters", {})
                self.checks(session.get("checks", []), path + "/checks", parameters, response["format"], "authentication")
                self.expression(session["token"], path + "/token", parameters, response["format"], operation="authentication")
                types = expression_types(session["token"])
                if types is not None and types - {"null"} != {"string"}:
                    self.add(path + "/token", "认证 token 必须返回字符串")
            if session["kind"] == "script":
                self.require("script-v2", path + "/login")
                self.errors += self.javascript.check_entry(session["login"], path + "/login")
            if "check" in session:
                self.operation("sessionCheck", session["check"], path + "/check", session=name)
        self.unique(self.site.get("actions", []), self.path + "/actions")
        if bool(self.site.get("actions")) != ("action" in self.site["operations"]):
            self.add(self.path + "/actions", "actions 声明和 action 操作必须同时提供")
        for name, operation in self.site["operations"].items():
            self.operation(name, operation, self.path + pointer(["operations", name]))
        return self.errors


def validate_package(document) -> PackageValidation:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    result = PackageValidation()
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    result.diagnostics = [
        issue(pointer(error.absolute_path), "字段不符合 v2 Schema（" + error.validator + "）", stage="schema")
        for error in sorted(validator.iter_errors(document), key=lambda error: pointer(error.absolute_path))
    ]
    result.checks["schema"] = "passed" if result.valid else "failed"
    if not result.valid:
        return result
    modules = document.get("modules", {})
    javascript = JavaScriptAnalysis(modules)
    result.diagnostics += javascript.diagnostics
    result.modules = sorted(modules)
    result.checks["javascript"] = "failed" if any(item["severity"] == "error" for item in javascript.diagnostics) else "passed"
    if "core-v2" not in document["requires"]:
        result.diagnostics.append(issue("/requires", "根 requires 必须包含 core-v2"))
    seen = set()
    capabilities = set(document["requires"])
    for index, site in enumerate(document["sites"]):
        path = pointer(["sites", index])
        if site["id"] in seen:
            result.diagnostics.append(issue(path + "/id", "站点 ID 重复"))
        seen.add(site["id"])
        capabilities.update(site["requires"])
        result.diagnostics += SiteValidator(site, path, document["requires"], schema, javascript).validate()
    result.capabilities = sorted(capabilities)
    requirements = [(document["requires"], "/requires")] + [
        (site["requires"], pointer(["sites", index, "requires"]))
        for index, site in enumerate(document["sites"])
    ]
    for names, path in requirements:
        for index, capability in enumerate(names):
            if capability not in KNOWN_CAPABILITIES:
                result.diagnostics.append(issue(path + pointer([index]), "工具不识别此能力，未判断宿主支持：" + capability,
                                                severity="warning", code="unsupported_feature"))
    if any(item["severity"] == "error" and item["stage"] == "references" for item in result.diagnostics):
        result.checks["references"] = "failed"
    elif any(not module.parsed for module in javascript.modules.values()):
        result.checks["references"] = "partial"
    else:
        result.checks["references"] = "passed"
    return result
