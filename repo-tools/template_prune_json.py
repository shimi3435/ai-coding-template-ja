"""検証済み JSON の field value 位置を標準 decoder で取得する。"""

import json
import re


def value_positions(source: str) -> dict[tuple, dict]:
    decoder = json.JSONDecoder()
    positions = {}

    def space(offset):
        match = re.match(r"\s*", source[offset:])
        return offset + match.end()

    def visit(offset, field):
        offset = space(offset)
        positions[tuple(field)] = {
            "line": source[:offset].count("\n") + 1,
            "position_kind": "field-value",
            "field_path": field,
        }
        char = source[offset]
        if char == "{":
            cursor = space(offset + 1)
            if source[cursor] == "}":
                return cursor + 1
            while True:
                key, end = decoder.raw_decode(source, cursor)
                cursor = space(end)
                if source[cursor] != ":":
                    raise ValueError("JSON key separator がない")
                cursor = space(visit(cursor + 1, [*field, key]))
                if source[cursor] == "}":
                    return cursor + 1
                if source[cursor] != ",":
                    raise ValueError("JSON member separator がない")
                cursor = space(cursor + 1)
        if char == "[":
            cursor = space(offset + 1)
            index = 0
            if source[cursor] == "]":
                return cursor + 1
            while True:
                cursor = space(visit(cursor, [*field, index]))
                if source[cursor] == "]":
                    return cursor + 1
                if source[cursor] != ",":
                    raise ValueError("JSON item separator がない")
                cursor = space(cursor + 1)
                index += 1
        return decoder.raw_decode(source, offset)[1]

    visit(0, [])
    return positions
