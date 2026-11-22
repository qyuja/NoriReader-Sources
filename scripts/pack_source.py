#!/usr/bin/env python3
"""Pack and statically validate Nori JSON sources without executing source code."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

try:
    from source_protocol.authoring import AuthoringError, MAX_SOURCE_BYTES, SourceInputs, canonical_bytes
    from source_protocol.nori_validation import HOST_DESCRIPTION, HOST_CAPABILITIES, KNOWN_CAPABILITIES, PackageValidation, issue, validate_package
except ModuleNotFoundError as error:
    if error.name not in {"jsonschema", "yaml", "tree_sitter", "tree_sitter_javascript"}:
        raise
    print(
        "缺少 Nori JSON 工具依赖。请使用 uv run --with-requirements scripts/source_protocol/requirements.txt "
        "scripts/pack_source.py，或在虚拟环境中安装该 requirements 文件。",
        file=sys.stderr,
    )
    raise SystemExit(2)


TOOL_VERSION = "0.2.0"


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    actions = command.add_subparsers(dest="action", required=True)
    pack = actions.add_parser("pack", help="把作者 YAML / JSON 和本地 JS 模块打包为 Nori JSON 源")
    pack.add_argument("input", type=Path, help="配置文件或含唯一 source.yaml / source.yml / source.json 的目录")
    pack.add_argument("-o", "--output", type=Path, required=True)
    pack.add_argument("--report", type=Path, help="默认与输出同名的 .report.json")
    pack.add_argument("--force", action="store_true", help="覆盖已有产物；不能覆盖任何输入文件")
    validate = actions.add_parser("validate", help="检查发布包；不改写包、不执行源或访问网络")
    validate.add_argument("input", type=Path, help="自包含的 .nori.json 发布包")
    validate.add_argument("--report", type=Path, help="可选：另外保存完整报告")
    validate.add_argument("--force", action="store_true", help="覆盖已有报告；不能覆盖输入")
    for action in (pack, validate):
        action.add_argument("--target", choices=("current", "protocol"), default="current", help="默认检查当前 App 能力；protocol 仅供未实现扩展草稿")
    actions.add_parser("capabilities", help="输出与 App 共用的宿主 SDK 能力和预算")
    create = actions.add_parser("init", help="创建可直接打包与运行的原生 Nori JSON 作者项目")
    create.add_argument("directory", type=Path)
    create.add_argument("--id", default="org.example.reader")
    create.add_argument("--name", default="我的 Nori 书源")
    return command


def protect_targets(targets: list[Path], inputs: SourceInputs):
    resolved = [path.resolve() for path in targets]
    if len(set(resolved)) != len(resolved) or any(path in inputs.protected for path in resolved):
        raise ValueError("输出与报告须为不同文件，且不能覆盖配置或任何引用的 JS 文件（包括 --force）")


def write_artifacts(artifacts: list[tuple[Path, bytes]], force: bool):
    for path, _ in artifacts:
        if path.exists() and not force:
            raise ValueError("产物已存在；需要覆盖时使用 --force：" + str(path))
        if path.is_dir():
            raise ValueError("产物路径不能是目录：" + str(path))
    for path, content in artifacts:
        path = path.resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, prefix="." + path.name + ".", delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(content)
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


def main() -> int:
    arguments = parser().parse_args()
    if arguments.action == "capabilities":
        print(json.dumps(HOST_DESCRIPTION, ensure_ascii=False, indent=2))
        return 0
    if arguments.action == "init":
        if arguments.directory.exists():
            print("目标目录已存在，未覆盖任何文件", file=sys.stderr)
            return 2
        template = Path(__file__).resolve().parents[1] / "docs/nori-source/examples"
        try:
            # Start from a complete native source rather than leaving empty operation stubs.
            import yaml
            document = yaml.safe_load((template / "offline.source.yaml").read_text(encoding="utf-8"))
            document["id"], document["name"] = arguments.id, arguments.name
            document["description"] = "Nori JSON 源作者项目"
            arguments.directory.mkdir(parents=True)
            (arguments.directory / "source.yaml").write_text("# yaml-language-server: $schema=./nori-authoring.schema.json\n" + yaml.safe_dump(document, allow_unicode=True, sort_keys=False), encoding="utf-8")
            (arguments.directory / "offline.js").write_bytes((template / "offline.js").read_bytes())
            for source, destination in [("sdk.d.ts", "nori-sdk.d.ts"), ("authoring.schema.json", "nori-authoring.schema.json")]:
                (arguments.directory / destination).write_bytes((template.parent / source).read_bytes())
            (arguments.directory / "jsconfig.json").write_bytes(canonical_bytes({
                "compilerOptions": {"allowJs": True, "checkJs": True, "noEmit": True, "strict": True, "target": "ES2022", "lib": ["ES2022"]},
                "include": ["*.js", "nori-sdk.d.ts"]
            }))
            print(json.dumps({"status": "created", "directory": str(arguments.directory)}, ensure_ascii=False))
            return 0
        except OSError as error:
            print(json.dumps({"status": "failed", "errno": error.errno}), file=sys.stderr)
            return 2
    packing = arguments.action == "pack"
    inputs = SourceInputs(arguments.input, authoring=packing)
    validation = PackageValidation()
    document = None
    package_bytes = None
    authoring_status = "failed"
    report_path = arguments.report or (arguments.output.with_suffix(".report.json") if packing else None)
    try:
        document = inputs.load()
        authoring_status = "passed"
        validation = validate_package(document)
        if arguments.target == "current" and validation.checks["schema"] == "passed":
            root_missing = set(document["requires"]) - HOST_CAPABILITIES
            runnable = 0
            for index, site in enumerate(document["sites"]):
                missing = (set(site["requires"]) | set(document["requires"])) - HOST_CAPABILITIES
                if not missing:
                    runnable += 1
                else:
                    validation.diagnostics.append(issue(f"/sites/{index}/requires", "当前宿主不支持：" + ", ".join(sorted(missing)), stage="hostSupport", severity="warning"))
            if root_missing or not runnable:
                validation.diagnostics.append(issue("/requires", "当前 App 无法运行此包的必需能力", stage="hostSupport", code="unsupported_feature"))
                validation.checks["hostSupport"] = "failed"
            else:
                validation.checks["hostSupport"] = "passed" if runnable == len(document["sites"]) else "partial"
        if packing and validation.valid:
            package_bytes = canonical_bytes(document)
            if len(package_bytes) > MAX_SOURCE_BYTES:
                validation.diagnostics.append(issue("", "发布包超过 16 MiB，未写入源包", stage="authoring"))
                authoring_status = "failed"
                package_bytes = None
    except AuthoringError as error:
        validation.diagnostics.append(error.diagnostic)
    except (UnicodeError, RecursionError):
        # Parsing errors must not print configuration or module source lines.
        authoring_status = "failed"
        validation.diagnostics.append(issue("", "输入不能编码为合法 UTF-8 JSON，或嵌套过深", stage="authoring"))
    except OSError as error:
        validation.diagnostics.append(issue("", "无法读取工具所需文件（errno=" + str(error.errno) + "）", stage="authoring"))

    report = {
        "format": "nori-source-build-report", "schemaVersion": 1,
        "tool": {"name": "nori-source-pack", "version": TOOL_VERSION},
        "status": "valid" if validation.valid else "invalid",
        "checks": {"authoring": authoring_status, **validation.checks},
        "inputs": inputs.files,
        "capabilities": {
            "declared": validation.capabilities,
            "unrecognized": sorted(set(validation.capabilities) - KNOWN_CAPABILITIES),
            "scriptSDKUsage": "not-analyzed",
            "target": arguments.target,
            "sdkVersion": HOST_DESCRIPTION["sdkVersion"],
            "unsupportedByHost": sorted(set(validation.capabilities) - HOST_CAPABILITIES),
        },
        "diagnostics": sorted(validation.diagnostics, key=lambda item: (item["path"], item["stage"], item["message"])),
    }
    if isinstance(document, dict):
        report["package"] = {key: document[key] for key in ("id", "version") if isinstance(document.get(key), str)}
        report["package"]["modules"] = [
            {"name": name, "sha256": hashlib.sha256(document["modules"][name].encode("utf-8")).hexdigest()}
            for name in validation.modules
        ]
    if package_bytes is not None:
        report["output"] = {"path": str(arguments.output), "bytes": len(package_bytes), "sha256": hashlib.sha256(package_bytes).hexdigest()}
    if report_path is not None:
        report["report"] = str(report_path)
    report["counts"] = {
        severity: sum(item["severity"] == severity for item in validation.diagnostics)
        for severity in ("error", "warning")
    }

    try:
        targets = ([arguments.output] if packing else []) + ([report_path] if report_path else [])
        protect_targets(targets, inputs)
        artifacts = [(arguments.output, package_bytes)] if package_bytes is not None else []
        if report_path:
            artifacts.append((report_path, canonical_bytes(report)))
        write_artifacts(artifacts, arguments.force)
    except (OSError, ValueError, UnicodeError) as error:
        print(json.dumps({"status": "invalid", "artifactError": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, allow_nan=False))
    return 0 if validation.valid else 2


if __name__ == "__main__":
    raise SystemExit(main())
