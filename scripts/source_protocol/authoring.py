"""Read Nori JSON author files and embed local modules without changing their code."""

from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import json
import math
from pathlib import Path
import re

import yaml

from .validation import parse_json, pointer


MAX_SOURCE_BYTES = 16 * 1024 * 1024


class AuthoringError(ValueError):
    def __init__(self, message: str, path: str = "", *, line: int | None = None, column: int | None = None):
        super().__init__(message)
        self.diagnostic = {
            "severity": "error", "stage": "authoring", "code": "invalid_definition",
            "path": path, "message": message,
        }
        if line is not None:
            self.diagnostic.update(line=line, column=column)


class AuthorLoader(yaml.SafeLoader):
    """YAML with JSON values: no duplicate keys, aliases, merges or implicit dates."""

    def compose_node(self, parent, index):
        event = self.peek_event()
        if isinstance(event, yaml.AliasEvent) or getattr(event, "anchor", None) is not None:
            raise yaml.composer.ComposerError(None, None, "不支持 YAML anchor / alias", event.start_mark)
        return super().compose_node(parent, index)

    def construct_mapping(self, node, deep=False):
        result = {}
        for key_node, value_node in node.value:
            if key_node.tag != "tag:yaml.org,2002:str":
                raise yaml.constructor.ConstructorError(None, None, "字段名必须为字符串，且不能使用 merge", key_node.start_mark)
            key = self.construct_object(key_node, deep=deep)
            if key in result:
                raise yaml.constructor.ConstructorError(None, None, "字段重复", key_node.start_mark)
            result[key] = self.construct_object(value_node, deep=deep)
        return result


# SafeLoader's YAML 1.1 booleans and timestamps would change author-supplied values.
AuthorLoader.yaml_implicit_resolvers = {
    key: [(tag, pattern) for tag, pattern in values if tag not in {
        "tag:yaml.org,2002:bool", "tag:yaml.org,2002:timestamp",
        "tag:yaml.org,2002:int", "tag:yaml.org,2002:float",
    }]
    for key, values in yaml.SafeLoader.yaml_implicit_resolvers.items()
}
AuthorLoader.add_implicit_resolver("tag:yaml.org,2002:bool", re.compile(r"^(?:true|false)$"), list("tf"))
AuthorLoader.add_implicit_resolver("tag:yaml.org,2002:int", re.compile(r"^-?(?:0|[1-9][0-9]*)$"), list("-0123456789"))
AuthorLoader.add_implicit_resolver(
    "tag:yaml.org,2002:float",
    re.compile(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+(?:[eE][+-]?[0-9]+)?|[eE][+-]?[0-9]+)$"),
    list("-0123456789"),
)


def json_values(value, path=""):
    """Reject YAML-specific values and non-finite numbers before serialization."""
    if isinstance(value, str):
        try:
            value.encode("utf-8")
        except UnicodeError as error:
            raise AuthoringError("字符串包含无效 Unicode 字符", path) from error
        return
    if value is None or isinstance(value, (bool, int)):
        return
    if isinstance(value, float) and math.isfinite(value):
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            json_values(child, path + pointer([index]))
        return
    if isinstance(value, dict) and all(isinstance(key, str) for key in value):
        for key, child in value.items():
            json_values(key, path)
            json_values(child, path + pointer([key]))
        return
    raise AuthoringError("配置只能包含 JSON 值及有限数字", path)


def canonical_bytes(value) -> bytes:
    text = json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n"
    return text.encode("utf-8")


@dataclass
class SourceInputs:
    path: Path
    authoring: bool
    files: list[dict] = field(default_factory=list)
    protected: set[Path] = field(default_factory=set)
    total_bytes: int = 0

    def read(self, path: Path, role: str, location="", module: str | None = None) -> str:
        path = path.resolve()
        self.protected.add(path)
        try:
            # A bounded read also covers files whose size changes after opening.
            with path.open("rb") as handle:
                raw = handle.read(MAX_SOURCE_BYTES + 1)
        except OSError as error:
            raise AuthoringError("无法读取作者配置或模块文件", location) from error
        self.total_bytes += len(raw)
        if self.total_bytes > MAX_SOURCE_BYTES:
            raise AuthoringError("配置与模块输入合计不能超过 16 MiB", location)
        item = {"role": role, "path": str(path), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
        if module is not None:
            item["module"] = module
        self.files.append(item)
        try:
            return raw.decode("utf-8")
        except UnicodeError as error:
            raise AuthoringError("输入必须使用 UTF-8 编码", location) from error

    def load(self):
        path = self.path.resolve()
        if path.is_dir() and self.authoring:
            candidates = [path / name for name in ("source.yaml", "source.yml", "source.json") if (path / name).is_file()]
            if len(candidates) != 1:
                raise AuthoringError("目录中须有唯一 source.yaml / source.yml / source.json；也可直接指定配置文件")
            path = candidates[0]
        self.path = path
        text = self.read(path, "manifest" if self.authoring else "package")
        try:
            if self.authoring and path.suffix.lower() in {".yaml", ".yml"}:
                document = yaml.load(text, Loader=AuthorLoader)
            else:
                document = parse_json(text)
        except yaml.YAMLError as error:
            mark = getattr(error, "problem_mark", None)
            raise AuthoringError(
                "YAML 无效：只接受 JSON 数据类型，不允许重复字段、anchor、alias 或 merge",
                line=mark.line + 1 if mark else None, column=mark.column + 1 if mark else None,
            ) from error
        except json.JSONDecodeError as error:
            raise AuthoringError("JSON 语法无效", line=error.lineno, column=error.colno) from error
        except ValueError as error:
            raise AuthoringError("JSON 无效：不允许重复字段或非有限数字") from error
        json_values(document)
        if not self.authoring or not isinstance(document, dict) or not isinstance(document.get("modules"), dict):
            return document

        modules = {}
        external = []
        errors = []
        for name, value in document["modules"].items():
            location = "/modules" + pointer([name])
            if isinstance(value, str):
                modules[name] = value
                continue
            if isinstance(value, dict) and isinstance(value.get("file"), str) and value["file"]:
                self.protected.add((path.parent / value["file"]).resolve())
            if not isinstance(value, dict) or not {"file"} <= set(value) <= {"file", "exportText"} or not isinstance(value["file"], str) or not value["file"]:
                errors.append(AuthoringError("模块须为源码字符串或 file 引用，可选 exportText 导出原程序文本", location))
                continue
            if "exportText" in value and (not isinstance(value["exportText"], str) or not re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", value["exportText"])):
                errors.append(AuthoringError("exportText 须为 JS 导出标识符", location + "/exportText"))
                continue
            relative = Path(value["file"])
            module_path = (path.parent / relative).resolve()
            if relative.is_absolute() or not module_path.is_relative_to(path.parent):
                errors.append(AuthoringError("模块 file 必须位于作者配置所在目录中", location + "/file"))
                continue
            self.protected.add(module_path)
            external.append((name, module_path, location, value.get("exportText")))
        if errors:
            raise errors[0]
        for name, module_path, location, export_text in external:
            code = self.read(module_path, "module", location + "/file", name)
            if export_text is not None:
                # A single legacy program is code data, not an executable ES module.
                # Preserve its exact text; the compatibility capability evaluates it.
                code = "export const " + export_text + " = " + json.dumps(code, ensure_ascii=False) + ";\n"
                self.files[-1]["exportText"] = export_text
            modules[name] = code
        document["modules"] = modules
        return document
