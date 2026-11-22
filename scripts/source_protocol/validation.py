"""Shared JSON parsing helpers used by the public Nori JSON 源 authoring tools."""

import json


def pointer(parts) -> str:
    return "".join("/" + str(part).replace("~", "~0").replace("/", "~1") for part in parts)


def parse_json(text: str):
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("JSON 包含重复字段")
            result[key] = value
        return result

    def invalid_constant(value):
        raise ValueError("JSON 不接受非有限数字")

    return json.loads(text.removeprefix("\ufeff"), object_pairs_hook=unique_object, parse_constant=invalid_constant)
