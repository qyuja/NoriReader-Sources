"""Inspect bundled ES modules with a parser. Never load or evaluate JavaScript."""

from __future__ import annotations

from dataclasses import dataclass, field
import posixpath
import re

from tree_sitter import Language, Parser
import tree_sitter_javascript

from .validation import pointer


@dataclass(frozen=True)
class Symbol:
    kind: str
    module: str = ""
    name: str = ""


@dataclass
class Module:
    bindings: dict[str, Symbol] = field(default_factory=dict)
    exports: dict[str, Symbol] = field(default_factory=dict)
    imports: list[tuple[Symbol, dict]] = field(default_factory=list)
    stars: list[str] = field(default_factory=list)
    var_bindings: set[str] = field(default_factory=set)
    parsed: bool = True


def module_name_valid(name: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_./-]+\.js", name)) and not name.startswith("/") and (
        posixpath.normpath(name) == name and all(part not in {"", ".", ".."} for part in name.split("/"))
    )


def walk(node):
    pending = [node]
    while pending:
        current = pending.pop()
        yield current
        pending.extend(reversed(current.named_children))


def text(node) -> str:
    return node.text.decode("utf-8") if node is not None else ""


def pattern_names(node):
    if node.type in {"identifier", "shorthand_property_identifier_pattern"}:
        yield text(node)
    elif node.type in {"pair_pattern", "assignment_pattern", "object_assignment_pattern"}:
        child = node.child_by_field_name("value" if node.type == "pair_pattern" else "left")
        if child is not None:
            yield from pattern_names(child)
    else:
        for child in node.named_children:
            yield from pattern_names(child)


def value_symbol(node) -> Symbol:
    if node is None:
        return Symbol("unknown")
    if node.type == "parenthesized_expression":
        return value_symbol(next(child for child in node.named_children if child.type != "comment"))
    if node.type in {"function_expression", "function_declaration", "arrow_function", "generator_function", "generator_function_declaration"}:
        asynchronous = any(child.type == "async" for child in node.children)
        generator = "generator" in node.type
        return Symbol("async-generator" if asynchronous and generator else "generator" if generator else "async" if asynchronous else "function")
    if node.type == "identifier":
        return Symbol("local", name=text(node))
    if node.type in {"string", "number", "true", "false", "null", "undefined", "object", "array", "class", "class_declaration", "regex"}:
        return Symbol("value")
    return Symbol("unknown")


class JavaScriptAnalysis:
    def __init__(self, sources: dict[str, str]):
        self.modules = {name: Module() for name in sources}
        self.diagnostics: list[dict] = []
        parser = Parser(Language(tree_sitter_javascript.language()))
        for name, source in sources.items():
            if not module_name_valid(name):
                self.issue(name, "模块名须为规范的包内相对 .js 路径，不允许空路径段、. 或 ..")
            try:
                tree = parser.parse(source.encode("utf-8"))
            except UnicodeError:
                self.issue(name, "模块包含不能编码为 UTF-8 的字符")
                self.modules[name].parsed = False
                continue
            if tree.root_node.has_error:
                self.modules[name].parsed = False
                error_node = tree.root_node
                for node in walk(tree.root_node):
                    if node.type == "ERROR" or node.is_missing:
                        error_node = node
                        break
                self.issue(name, "JavaScript 语法树包含错误或缺失语法", error_node)
                continue
            self.inspect(name, tree.root_node)
        # Static imports are link requirements, even when their binding is unused.
        for name, module in self.modules.items():
            for symbol, location in module.imports:
                resolved = self.resolve_export(symbol.module, symbol.name, set())
                if resolved.kind in {"missing", "ambiguous"}:
                    self.diagnostics.append({**location, "message": "导入或转导出的名称不存在，或被多个 export * 弄成歧义"})

    def issue(self, module: str, message: str, node=None, *, severity="error", path: str | None = None):
        item = {
            "severity": severity, "stage": "javascript", "code": "invalid_definition",
            "path": path if path is not None else "/modules" + pointer([module]), "message": message,
        }
        if node is not None:
            item.update(line=node.start_point.row + 1, column=node.start_point.column + 1)
        self.diagnostics.append(item)
        return item

    def name(self, module: str, node) -> str | None:
        value = text(node)
        if node is not None and node.type == "string":
            value = value[1:-1]
        if not re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", value):
            self.issue(module, "静态工具仅支持未转义的 ASCII 导入 / 导出名称", node)
            return None
        return value

    def dependency(self, module: str, node) -> str | None:
        raw = text(node)
        specifier = raw[1:-1]
        if "\\" in specifier or not specifier.startswith(("./", "../")):
            self.issue(module, "模块只支持未转义的相对静态导入；请预先打包外部依赖", node)
            return None
        target = posixpath.normpath(posixpath.join(posixpath.dirname(module), specifier))
        if not module_name_valid(target) or target not in self.modules:
            self.issue(module, "导入指向不存在的包内 .js 模块", node)
            return None
        return target

    def bind(self, module: str, name: str, symbol: Symbol, node, *, variable=False):
        if name in self.modules[module].bindings:
            if variable and name in self.modules[module].var_bindings:
                symbol = Symbol("unknown")  # Legal var redeclaration; do not infer its final value.
            else:
                self.issue(module, "顶层绑定重复；请使用唯一的函数、变量及导入名称", node)
        self.modules[module].bindings[name] = symbol
        if variable:
            self.modules[module].var_bindings.add(name)

    def export(self, module: str, name: str, symbol: Symbol, node):
        if name in self.modules[module].exports:
            self.issue(module, "模块导出名称重复", node)
        self.modules[module].exports[name] = symbol

    def imported(self, module: str, target: str, name: str, node) -> Symbol:
        symbol = Symbol("import", target, name)
        self.modules[module].imports.append((symbol, {
            "severity": "error", "stage": "javascript", "code": "invalid_definition",
            "path": "/modules" + pointer([module]), "line": node.start_point.row + 1,
            "column": node.start_point.column + 1,
        }))
        return symbol

    def declaration(self, module: str, node) -> list[str]:
        names = []
        if node.type in {"function_declaration", "generator_function_declaration", "class_declaration"}:
            name_node = node.child_by_field_name("name")
            if name_node is not None:
                name = text(name_node)
                self.bind(module, name, value_symbol(node), node)
                names.append(name)
        elif node.type in {"lexical_declaration", "variable_declaration"}:
            for child in node.named_children:
                if child.type != "variable_declarator":
                    continue
                pattern = child.child_by_field_name("name")
                symbol = value_symbol(child.child_by_field_name("value"))
                for name in pattern_names(pattern):
                    self.bind(module, name, symbol if pattern.type == "identifier" else Symbol("unknown"), child,
                              variable=node.type == "variable_declaration")
                    names.append(name)
        return names

    def inspect(self, module: str, root):
        for node in walk(root):
            if node.type.startswith("jsx_") or node.type in {"decorator", "import_attribute"}:
                self.issue(module, "此发布格式不接受 JSX、decorator 或 import attributes；请先转为普通 ES 模块", node)
            if node.type == "call_expression" and node.child_by_field_name("function").type == "import":
                self.issue(module, "发布包仅支持静态 import；动态 import 尚无宿主契约", node)

        for node in root.named_children:
            if node.type == "import_statement":
                target = self.dependency(module, node.child_by_field_name("source"))
                if target is None:
                    continue
                clause = next((child for child in node.named_children if child.type == "import_clause"), None)
                if clause is None:
                    continue
                for child in clause.named_children:
                    if child.type == "identifier":
                        self.bind(module, text(child), self.imported(module, target, "default", child), child)
                    elif child.type == "namespace_import":
                        alias = next(item for item in child.named_children if item.type == "identifier")
                        self.bind(module, text(alias), Symbol("value"), child)
                    elif child.type == "named_imports":
                        for specifier in child.named_children:
                            if specifier.type != "import_specifier":
                                continue
                            original = self.name(module, specifier.child_by_field_name("name"))
                            alias = self.name(module, specifier.child_by_field_name("alias") or specifier.child_by_field_name("name"))
                            if original and alias:
                                self.bind(module, alias, self.imported(module, target, original, specifier), specifier)
                continue
            if node.type != "export_statement":
                self.declaration(module, node)
                continue
            declaration = node.child_by_field_name("declaration")
            names = self.declaration(module, declaration) if declaration is not None else []
            if any(child.type == "default" for child in node.children):
                value = declaration or node.child_by_field_name("value")
                symbol = Symbol("local", name=names[0]) if names else value_symbol(value)
                self.export(module, "default", symbol, node)
                continue
            for name in names:
                self.export(module, name, Symbol("local", name=name), node)
            source = node.child_by_field_name("source")
            target = self.dependency(module, source) if source is not None else None
            clause = next((child for child in node.named_children if child.type == "export_clause"), None)
            namespace = next((child for child in node.named_children if child.type == "namespace_export"), None)
            if clause is not None:
                for specifier in clause.named_children:
                    if specifier.type != "export_specifier":
                        continue
                    original = self.name(module, specifier.child_by_field_name("name"))
                    alias = self.name(module, specifier.child_by_field_name("alias") or specifier.child_by_field_name("name"))
                    if original and alias and (source is None or target is not None):
                        symbol = self.imported(module, target, original, specifier) if target else Symbol("local", name=original)
                        self.export(module, alias, symbol, specifier)
            elif namespace is not None and target:
                alias_node = next(child for child in namespace.named_children if child.type in {"identifier", "string"})
                alias = self.name(module, alias_node)
                if alias:
                    self.export(module, alias, Symbol("value"), namespace)
            elif target:
                self.modules[module].stars.append(target)

        # Mutable bindings can no longer be classified from their initial value.
        for node in walk(root):
            if node.type in {"assignment_expression", "augmented_assignment_expression", "update_expression"}:
                target = node.child_by_field_name("left") or node.child_by_field_name("argument")
                if target is not None and target.type == "identifier" and text(target) in self.modules[module].bindings:
                    self.modules[module].bindings[text(target)] = Symbol("unknown")
        for name, symbol in self.modules[module].exports.items():
            if symbol.kind == "local" and symbol.name not in self.modules[module].bindings:
                self.issue(module, "export 列表引用了未声明的顶层绑定")

    def resolve_symbol(self, module: str, key: str, symbol: Symbol, seen: set) -> Symbol:
        marker = (module, "binding", key)
        if marker in seen:
            return Symbol("unknown", module, key)
        seen = seen | {marker}
        if symbol.kind == "local":
            target = self.modules[module].bindings.get(symbol.name)
            return self.resolve_symbol(module, symbol.name, target, seen) if target else Symbol("missing")
        if symbol.kind == "import":
            return self.resolve_export(symbol.module, symbol.name, seen)
        return Symbol(symbol.kind, module, key)

    def resolve_export(self, module: str, name: str, seen: set) -> Symbol:
        item = self.modules.get(module)
        if item is None:
            return Symbol("missing")
        if not item.parsed:
            return Symbol("unknown", module, name)
        if (module, "export", name) in seen:
            return Symbol("missing")
        seen = seen | {(module, "export", name)}
        if name in item.exports:
            return self.resolve_symbol(module, "export:" + name, item.exports[name], seen)
        candidates = [] if name == "default" else [self.resolve_export(target, name, seen) for target in item.stars]
        found = {symbol for symbol in candidates if symbol.kind != "missing"}
        if not found:
            return Symbol("missing")
        return next(iter(found)) if len(found) == 1 else Symbol("ambiguous")

    def check_entry(self, entry: dict, path: str, *, synchronous=False) -> list[dict]:
        module, name = entry["module"], entry["export"]
        if module not in self.modules:
            return [self.entry_issue(path + "/module", "入口引用了不存在的包内模块")]
        if not self.modules[module].parsed:
            return []  # The parser diagnostic already identifies this module.
        symbol = self.resolve_export(module, name, set())
        if symbol.kind in {"missing", "ambiguous"}:
            return [self.entry_issue(path + "/export", "入口导出不存在或有歧义")]
        if symbol.kind in {"value", "generator", "async-generator"}:
            return [self.entry_issue(path, "入口须为普通函数，不能是常量、class 或 generator")]
        if synchronous and symbol.kind == "async":
            return [self.entry_issue(path, "字段表达式及方言上下文工厂必须同步；异步流程应放入操作级 script")]
        if symbol.kind == "unknown":
            return [self.entry_issue(path, "此导出的函数类型不能由静态声明确认，仍须由宿主检查", severity="warning")]
        return []

    @staticmethod
    def entry_issue(path: str, message: str, severity="error") -> dict:
        return {"severity": severity, "stage": "references", "code": "invalid_definition", "path": path, "message": message}
