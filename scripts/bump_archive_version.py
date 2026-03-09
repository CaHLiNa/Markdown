#!/usr/bin/env python3

from __future__ import annotations

import os
import plistlib
import re
import sys
from pathlib import Path
from typing import NoReturn


TARGET_NAME = "Markdown"


def fail(message: str) -> "NoReturn":
    print(f"[archive-version] {message}", file=sys.stderr)
    raise SystemExit(1)


def bump_marketing_version(version: str) -> str:
    match = re.fullmatch(r"(\d+)\.(\d+)", version)
    if not match:
        fail(f"不支持的版本格式: {version}")

    major = int(match.group(1))
    minor = int(match.group(2)) + 1

    if minor >= 10:
        major += minor // 10
        minor %= 10

    return f"{major}.{minor}"


def should_run_for_archive(environment: dict[str, str]) -> bool:
    return (
        environment.get("ACTION") == "install"
        and environment.get("DEPLOYMENT_LOCATION") == "YES"
        and environment.get("CONFIGURATION") == "Release"
    )


def find_target_configuration_ids(project_text: str) -> list[str]:
    target_pattern = re.compile(
        rf"""
        (?P<target_id>[A-Z0-9]+)\ /\*\ {re.escape(TARGET_NAME)}\ \*/\ =\ \{{.*?
        buildConfigurationList\ =\ (?P<config_list_id>[A-Z0-9]+)\ /\*\ Build\ configuration\ list\ for\ PBXNativeTarget\ "{re.escape(TARGET_NAME)}"\ \*/;
        """,
        re.DOTALL | re.VERBOSE,
    )
    target_match = target_pattern.search(project_text)
    if not target_match:
        fail(f"找不到 target {TARGET_NAME} 的配置列表")

    config_list_id = target_match.group("config_list_id")
    list_pattern = re.compile(
        rf"""
        {config_list_id}\ /\*\ Build\ configuration\ list\ for\ PBXNativeTarget\ "{re.escape(TARGET_NAME)}"\ \*/\ =\ \{{.*?
        buildConfigurations\ =\ \(
        (?P<body>.*?)
        \);\s*
        defaultConfigurationIsVisible
        """,
        re.DOTALL | re.VERBOSE,
    )
    list_match = list_pattern.search(project_text)
    if not list_match:
        fail(f"找不到 target {TARGET_NAME} 的 buildConfigurations")

    configuration_ids = re.findall(r"([A-Z0-9]+)\ /\*\ .+?\ \*/", list_match.group("body"))
    if not configuration_ids:
        fail(f"target {TARGET_NAME} 没有找到任何 build configuration")
    return configuration_ids


def replace_marketing_versions(project_text: str, configuration_ids: list[str]) -> tuple[str, str, str]:
    versions: list[str] = []

    def make_pattern(configuration_id: str) -> re.Pattern[str]:
        return re.compile(
            rf"""
            (
                {configuration_id}\ /\*\ .+?\ \*/\ =\ \{{.*?
                \n\s*MARKETING_VERSION\ =\ 
            )
            (?P<version>\d+\.\d+)
            (?P<suffix>;)
            """,
            re.DOTALL | re.VERBOSE,
        )

    for configuration_id in configuration_ids:
        match = make_pattern(configuration_id).search(project_text)
        if not match:
            fail(f"配置 {configuration_id} 中找不到 MARKETING_VERSION")
        versions.append(match.group("version"))

    unique_versions = set(versions)
    if len(unique_versions) != 1:
        fail(f"Debug/Release 的 MARKETING_VERSION 不一致: {sorted(unique_versions)}")

    current_version = versions[0]
    next_version = bump_marketing_version(current_version)
    updated_text = project_text

    for configuration_id in configuration_ids:
        pattern = make_pattern(configuration_id)
        updated_text, replacements = pattern.subn(
            lambda match: f"{match.group(1)}{next_version}{match.group('suffix')}",
            updated_text,
            count=1,
        )
        if replacements != 1:
            fail(f"配置 {configuration_id} 的 MARKETING_VERSION 更新失败")

    return updated_text, current_version, next_version


def update_built_product_version(environment: dict[str, str], version: str) -> None:
    target_build_dir = environment.get("TARGET_BUILD_DIR")
    info_plist_path = environment.get("INFOPLIST_PATH")

    if not target_build_dir or not info_plist_path:
        fail("构建环境中缺少 TARGET_BUILD_DIR 或 INFOPLIST_PATH")

    plist_path = Path(target_build_dir) / info_plist_path
    if not plist_path.exists():
        fail(f"找不到已生成的 Info.plist: {plist_path}")

    with plist_path.open("rb") as file:
        plist = plistlib.load(file)

    plist["CFBundleShortVersionString"] = version

    with plist_path.open("wb") as file:
        plistlib.dump(plist, file, sort_keys=False)


def resolve_project_path(environment: dict[str, str]) -> Path:
    project_file_path = environment.get("PROJECT_FILE_PATH")
    if project_file_path:
        project_path = Path(project_file_path) / "project.pbxproj"
        if project_path.exists():
            return project_path

    repository_root = Path(__file__).resolve().parent.parent
    return repository_root / "Markdown.xcodeproj" / "project.pbxproj"


def main() -> int:
    environment = dict(os.environ)

    if not should_run_for_archive(environment):
        print("[archive-version] skip: 仅在 Release Archive 中递增版本")
        return 0

    project_path = resolve_project_path(environment)

    if not project_path.exists():
        fail(f"找不到工程文件: {project_path}")

    original_text = project_path.read_text(encoding="utf-8")
    configuration_ids = find_target_configuration_ids(original_text)
    updated_text, current_version, next_version = replace_marketing_versions(
        original_text,
        configuration_ids,
    )

    if updated_text == original_text:
        fail("未检测到版本变化")

    project_path.write_text(updated_text, encoding="utf-8")
    update_built_product_version(environment, next_version)
    print(
        f"[archive-version] {TARGET_NAME} MARKETING_VERSION: {current_version} -> {next_version}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
