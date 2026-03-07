#!/usr/bin/env ruby

require 'xcodeproj'

PROJECT_PATH = File.expand_path('../Markdown.xcodeproj', __dir__)
APP_TARGET_NAME = 'Markdown'
TEST_TARGET_NAME = 'MarkdownTests'
TESTS_GROUP_PATH = 'Tests'
TOOLS_VERSION = '26.3'
MACOS_DEPLOYMENT_TARGET = '15.7'
DEVELOPMENT_TEAM = 'NC5MXQKZ5X'
TEST_BUNDLE_IDENTIFIER = 'com.MarkdownTests'

def find_or_create_tests_group(project)
  root_group = project.main_group
  synchronized_group_class = Xcodeproj::Project::Object::PBXFileSystemSynchronizedRootGroup

  existing_group = root_group.children.find do |child|
    child.is_a?(synchronized_group_class) && child.path == TESTS_GROUP_PATH
  end
  return existing_group if existing_group

  group = project.new(synchronized_group_class)
  group.path = TESTS_GROUP_PATH
  group.source_tree = '<group>'
  root_group.children << group
  group
end

def find_or_create_test_target(project)
  existing_target = project.targets.find { |target| target.name == TEST_TARGET_NAME }
  return existing_target if existing_target

  project.new_target(
    :unit_test_bundle,
    TEST_TARGET_NAME,
    :osx,
    MACOS_DEPLOYMENT_TARGET,
    project.products_group,
    :swift
  )
end

def ensure_dependency(test_target, app_target)
  return if test_target.dependencies.any? { |dependency| dependency.target == app_target }

  test_target.add_dependency(app_target)
end

def ensure_tests_group_membership(test_target, tests_group)
  return if test_target.file_system_synchronized_groups.include?(tests_group)

  test_target.file_system_synchronized_groups << tests_group
end

def ensure_xctest_framework(test_target)
  framework_paths = test_target.frameworks_build_phase.files_references.map(&:path)
  return if framework_paths.any? { |path| path&.end_with?('/XCTest.framework') }

  test_target.add_system_framework('XCTest')
end

def configure_build_settings(test_target)
  test_host = "$(BUILT_PRODUCTS_DIR)/#{APP_TARGET_NAME}.app/Contents/MacOS/#{APP_TARGET_NAME}"

  test_target.build_configurations.each do |configuration|
    settings = configuration.build_settings
    settings['CODE_SIGN_STYLE'] = 'Automatic'
    settings['DEVELOPMENT_TEAM'] = DEVELOPMENT_TEAM
    settings['GENERATE_INFOPLIST_FILE'] = 'YES'
    settings['LD_RUNPATH_SEARCH_PATHS'] = [
      '$(inherited)',
      '@executable_path/../Frameworks',
      '@loader_path/../Frameworks',
    ]
    settings['MACOSX_DEPLOYMENT_TARGET'] = MACOS_DEPLOYMENT_TARGET
    settings['PRODUCT_BUNDLE_IDENTIFIER'] = TEST_BUNDLE_IDENTIFIER
    settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
    settings['SWIFT_VERSION'] = '5.0'
    settings['TEST_HOST'] = test_host
    settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
  end
end

def configure_target_attributes(project, test_target, app_target)
  target_attributes = project.root_object.attributes['TargetAttributes'] ||= {}
  target_attributes[test_target.uuid] ||= {}
  target_attributes[test_target.uuid]['CreatedOnToolsVersion'] = TOOLS_VERSION
  target_attributes[test_target.uuid]['TestTargetID'] = app_target.uuid
end

def save_shared_scheme(project, app_target, test_target)
  scheme = Xcodeproj::XCScheme.new
  scheme.configure_with_targets(app_target, test_target, launch_target: true)
  scheme.save_as(PROJECT_PATH, APP_TARGET_NAME, true)
end

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |target| target.name == APP_TARGET_NAME }
abort("Missing target #{APP_TARGET_NAME}.") unless app_target

tests_group = find_or_create_tests_group(project)
test_target = find_or_create_test_target(project)

ensure_dependency(test_target, app_target)
ensure_tests_group_membership(test_target, tests_group)
ensure_xctest_framework(test_target)
configure_build_settings(test_target)
configure_target_attributes(project, test_target, app_target)

project.save
save_shared_scheme(project, app_target, test_target)
