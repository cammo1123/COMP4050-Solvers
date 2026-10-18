cmake_minimum_required(VERSION 3.18)
project(bionic-solver VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE RelWithDebInfo CACHE STRING "" FORCE)
endif()

option(COMP4050_BUILD_ADDON "Build the Node.js N-API addon" ON)
option(
    COMP4050_STATIC_CXX_RUNTIME
    "Link the C++ runtime statically on Linux so the binaries do not depend on the host libstdc++ version"
    OFF
)

# ---- build info ----
find_package(Git QUIET)

set(BUILDINFO_PROJECT_NAME "${PROJECT_NAME}")
set(BUILDINFO_PROJECT_VERSION "${PROJECT_VERSION}")
set(BUILDINFO_PLATFORM "${CMAKE_SYSTEM_NAME}")

# The containerised Linux build copies the sources without the git metadata, so
# the caller can pass the revision in; the repository wins when it has one.
if("${BUILDINFO_GIT_HASH}" STREQUAL "")
    set(BUILDINFO_GIT_HASH "unknown")
endif()

if("${BUILDINFO_GIT_BRANCH}" STREQUAL "")
    set(BUILDINFO_GIT_BRANCH "unknown")
endif()

set(BUILDINFO_BUILD_TIME "")

if(GIT_FOUND)
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" rev-parse --short HEAD
        WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
        OUTPUT_VARIABLE buildinfo_git_hash
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET
        RESULT_VARIABLE buildinfo_git_hash_result
    )
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" rev-parse --abbrev-ref HEAD
        WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
        OUTPUT_VARIABLE buildinfo_git_branch
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET
        RESULT_VARIABLE buildinfo_git_branch_result
    )

    if(buildinfo_git_hash_result EQUAL 0 AND buildinfo_git_hash)
        set(BUILDINFO_GIT_HASH "${buildinfo_git_hash}")
    endif()

    if(buildinfo_git_branch_result EQUAL 0 AND buildinfo_git_branch AND NOT buildinfo_git_branch STREQUAL "HEAD")
        set(BUILDINFO_GIT_BRANCH "${buildinfo_git_branch}")
    endif()
endif()

string(TIMESTAMP BUILDINFO_BUILD_TIME "%Y-%m-%d %H:%M:%S UTC" UTC)

if(CMAKE_SIZEOF_VOID_P EQUAL 8)
    set(BUILDINFO_ARCH "${CMAKE_SYSTEM_PROCESSOR} 64-bit")
else()
    set(BUILDINFO_ARCH "${CMAKE_SYSTEM_PROCESSOR} 32-bit")
endif()

set(BUILDINFO_COMPILER "${CMAKE_CXX_COMPILER_ID} ${CMAKE_CXX_COMPILER_VERSION}")

if(NOT BUILDINFO_NODE_VERSION)
    set(BUILDINFO_NODE_VERSION "none")
endif()

function(comp4050_fetch_archive url dest)
    set(archive "${dest}.tar.gz")
    set(download_archive TRUE)

    if(EXISTS "${archive}")
        execute_process(
            COMMAND "${CMAKE_COMMAND}" -E tar tzf "${archive}"
            RESULT_VARIABLE archive_status
            OUTPUT_QUIET
            ERROR_QUIET
        )

        if(archive_status EQUAL 0)
            set(download_archive FALSE)
        endif()
    endif()

    if(download_archive)
        set(download "${archive}.download")
        file(DOWNLOAD "${url}" "${download}" STATUS download_status TLS_VERIFY ON)
        list(GET download_status 0 status_code)

        if(NOT status_code EQUAL 0)
            list(GET download_status 1 error_msg)
            file(REMOVE "${download}")
            message(FATAL_ERROR "Failed to download ${url}: ${error_msg}")
        endif()

        execute_process(
            COMMAND "${CMAKE_COMMAND}" -E tar tzf "${download}"
            RESULT_VARIABLE download_status
            OUTPUT_QUIET
            ERROR_QUIET
        )

        if(NOT download_status EQUAL 0)
            file(REMOVE "${download}")
            message(FATAL_ERROR "Downloaded archive from ${url} is invalid")
        endif()

        file(RENAME "${download}" "${archive}")
    endif()

    file(ARCHIVE_EXTRACT INPUT "${archive}" DESTINATION "${dest}")
endfunction()

find_package(Threads REQUIRED)

# The prebuild is loaded with dlopen(), so the host has to provide every symbol
# version the binary asks for: one built with GCC 13 needs GLIBCXX_3.4.32,
# which a host with GCC 11 does not have. Linking the C++ runtime statically
# removes that dependency, and the flags below keep the symbols of the static
# archives and of the addon itself local, so the libstdc++ the host has already
# loaded cannot preempt the copies the addon was compiled against.
set(COMP4050_STATIC_CXX_FLAGS "")
set(COMP4050_HIDDEN_VISIBILITY_FLAGS "")

if(COMP4050_STATIC_CXX_RUNTIME AND UNIX AND NOT APPLE)
    unset(COMP4050_LIBSTDCXX_STATIC CACHE)
    set(comp4050_saved_library_suffixes "${CMAKE_FIND_LIBRARY_SUFFIXES}")
    set(CMAKE_FIND_LIBRARY_SUFFIXES ".a")
    find_library(
        COMP4050_LIBSTDCXX_STATIC
        NAMES stdc++
        PATHS ${CMAKE_CXX_IMPLICIT_LINK_DIRECTORIES}
        NO_DEFAULT_PATH
    )
    set(CMAKE_FIND_LIBRARY_SUFFIXES "${comp4050_saved_library_suffixes}")
    unset(comp4050_saved_library_suffixes)

    if(COMP4050_LIBSTDCXX_STATIC)
        set(
            COMP4050_STATIC_CXX_FLAGS
            "-static-libstdc++"
            "-static-libgcc"
            "-Wl,--exclude-libs,ALL"
        )
        set(
            COMP4050_HIDDEN_VISIBILITY_FLAGS
            "-fvisibility=hidden"
            "-fvisibility-inlines-hidden"
        )
    else()
        message(
            WARNING
            "libstdc++.a was not found; the binaries will require the host libstdc++ to be at least as new as the build toolchain."
        )
    endif()
endif()

find_program(NODE_EXECUTABLE node)

# The generated bindings from fbs/*.fbs define the boundary types shared by the
# core, the CLI, and the addon, so the header-only FlatBuffers runtime and the
# generated headers are required regardless of COMP4050_BUILD_ADDON.
set(FLATBUFFERS_VERSION "25.12.19")
set(flatbuffers_dir "${CMAKE_BINARY_DIR}/flatbuffers-${FLATBUFFERS_VERSION}")
set(flatbuffers_include "${flatbuffers_dir}/flatbuffers-${FLATBUFFERS_VERSION}/include")

if(NOT EXISTS "${flatbuffers_include}/flatbuffers/flatbuffers.h")
    comp4050_fetch_archive(
        "https://github.com/google/flatbuffers/archive/refs/tags/v${FLATBUFFERS_VERSION}.tar.gz"
        "${flatbuffers_dir}"
    )
endif()

set(GENERATED_DIR "${CMAKE_CURRENT_SOURCE_DIR}/src/gen")
set(PHP_GENERATED_DIR "${CMAKE_CURRENT_SOURCE_DIR}/src/php/gen")
file(GLOB_RECURSE SCHEMA_FILES CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/fbs/*.fbs")
file(GLOB_RECURSE OPERATION_SCHEMA_FILES CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/fbs/operations/*.fbs")
file(GLOB_RECURSE CODEGEN_SCRIPTS CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/scripts/*")

set(GENERATED_HEADERS)
set(PHP_GENERATED_HEADERS)

foreach(schema IN LISTS SCHEMA_FILES)
    get_filename_component(schema_name "${schema}" NAME_WE)
    list(APPEND GENERATED_HEADERS
        "${GENERATED_DIR}/${schema_name}_generated.h"
        "${GENERATED_DIR}/${schema_name}_domain_generated.h")
    list(APPEND PHP_GENERATED_HEADERS
        "${PHP_GENERATED_DIR}/${schema_name}_php_generated.h")
endforeach()

foreach(schema IN LISTS OPERATION_SCHEMA_FILES)
    get_filename_component(schema_name "${schema}" NAME_WE)
    list(APPEND GENERATED_HEADERS
        "${GENERATED_DIR}/${schema_name}_translation_generated.h")
    list(APPEND PHP_GENERATED_HEADERS
        "${PHP_GENERATED_DIR}/${schema_name}_php_generated.h")
endforeach()

# SCHEMA_FILES globs recursively and therefore already covers the operation
# schemas, so both loops can name the same output.
list(REMOVE_DUPLICATES GENERATED_HEADERS)
list(REMOVE_DUPLICATES PHP_GENERATED_HEADERS)

if(NOT NODE_EXECUTABLE)
    set(COMP4050_CODEGEN OFF)
endif()

option(COMP4050_CODEGEN "Regenerate the FlatBuffers bindings from fbs/ (requires node on PATH)" ON)

set(CODEGEN_OUTPUTS ${GENERATED_HEADERS} ${PHP_GENERATED_HEADERS})

if(COMP4050_CODEGEN)
    if(NOT NODE_EXECUTABLE)
        message(FATAL_ERROR "node not found on PATH; required to generate FlatBuffers bindings")
    endif()

    add_custom_command(
        OUTPUT ${CODEGEN_OUTPUTS}
        COMMAND "${NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/scripts/generate.mjs"
        DEPENDS
        ${SCHEMA_FILES}
        ${CODEGEN_SCRIPTS}
        WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
        VERBATIM
    )
else()
    # The generated headers are committed, so a build without node only needs
    # them to be present and current. This is what keeps the PHP target
    # independent of the node toolchain.
    foreach(header IN LISTS CODEGEN_OUTPUTS)
        if(NOT EXISTS "${header}")
            message(FATAL_ERROR
                "${header} is missing and codegen is off; install node on PATH to regenerate the bindings")
        endif()
    endforeach()
endif()

add_subdirectory(src/algorithms/php_solver)

add_library(solver_core OBJECT
    src/solver.cpp
    src/algorithms/algo_registry.cpp
    src/algorithms/extreme_point/algo_extreme_point.cpp
    src/algorithms/stack_based/algo_stack_based.cpp
    src/algorithms/php_solver/php_solver.cpp
    src/algorithms/heightmap_solver/heightmap_solver.cpp
    ${GENERATED_HEADERS}
)
target_include_directories(solver_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src ${CMAKE_CURRENT_BINARY_DIR} ${GENERATED_DIR})
target_include_directories(solver_core SYSTEM PUBLIC ${flatbuffers_include})
target_link_libraries(solver_core PUBLIC php_solver Threads::Threads)

add_executable(solver src/main.cpp)
target_link_libraries(solver PRIVATE solver_core)

foreach(target php_solver solver_core solver)
    if(MSVC)
        target_compile_options(${target} PRIVATE /W4)
    else()
        target_compile_options(${target} PRIVATE -Wall -Wextra)
    endif()
endforeach()

if(COMP4050_HIDDEN_VISIBILITY_FLAGS)
    foreach(target php_solver solver_core)
        target_compile_options(${target} PRIVATE ${COMP4050_HIDDEN_VISIBILITY_FLAGS})
    endforeach()
endif()

if(COMP4050_STATIC_CXX_FLAGS)
    target_link_options(solver PRIVATE ${COMP4050_STATIC_CXX_FLAGS})
endif()

# solver_core and php_solver are linked into the Node addon module, which
# requires position-independent code.
set_target_properties(php_solver solver_core PROPERTIES POSITION_INDEPENDENT_CODE ON)

if(COMP4050_BUILD_ADDON)
    execute_process(
        COMMAND "${NODE_EXECUTABLE}" -p "process.versions.node"
        OUTPUT_VARIABLE node_version
        OUTPUT_STRIP_TRAILING_WHITESPACE
        RESULT_VARIABLE node_version_result
    )
    execute_process(
        COMMAND "${NODE_EXECUTABLE}" -p "process.config.variables.target_arch"
        OUTPUT_VARIABLE node_arch
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )

    if(NOT node_version_result EQUAL 0 OR NOT node_version OR NOT node_arch)
        message(FATAL_ERROR "Failed to query the Node.js version and architecture")
    endif()

    set(BUILDINFO_NODE_VERSION "v${node_version}")

    set(node_dir "${CMAKE_BINARY_DIR}/node-v${node_version}")
    set(node_include "${node_dir}/node-v${node_version}/include/node")

    if(NOT EXISTS "${node_include}/node_api.h")
        comp4050_fetch_archive(
            "https://nodejs.org/download/release/v${node_version}/node-v${node_version}-headers.tar.gz"
            "${node_dir}"
        )
    endif()

    set(node_lib "")

    if(WIN32)
        if(node_arch STREQUAL "ia32")
            set(win_arch "x86")
        else()
            set(win_arch "${node_arch}")
        endif()

        set(node_lib "${node_dir}/win-${win_arch}/node.lib")

        if(NOT EXISTS "${node_lib}")
            file(DOWNLOAD
                "https://nodejs.org/download/release/v${node_version}/win-${win_arch}/node.lib"
                "${node_lib}"
                STATUS download_status
            )
            list(GET download_status 0 status_code)

            if(NOT status_code EQUAL 0)
                message(FATAL_ERROR "Failed to download node.lib: ${node_lib}")
            endif()
        endif()
    endif()

    set(napi_dir "${CMAKE_BINARY_DIR}/node-addon-api/node-addon-api-8.9.1")

    if(NOT EXISTS "${napi_dir}/napi.h")
        comp4050_fetch_archive(
            "https://github.com/nodejs/node-addon-api/archive/refs/tags/v8.9.1.tar.gz"
            "${CMAKE_BINARY_DIR}/node-addon-api"
        )
    endif()

    add_library(solver_addon MODULE src/addon.cpp src/solve_worker.cpp ${GENERATED_HEADERS})
    target_include_directories(solver_addon PRIVATE "${GENERATED_DIR}")
    target_include_directories(solver_addon SYSTEM PRIVATE "${node_include}" "${napi_dir}" "${flatbuffers_include}")

    # Target the lowest Node-API version required by ThreadSafeFunction.
    target_compile_definitions(solver_addon PRIVATE NAPI_VERSION=4)
    target_link_libraries(solver_addon PRIVATE solver_core)
    set_target_properties(solver_addon PROPERTIES PREFIX "" OUTPUT_NAME "addon" SUFFIX ".node")

    if(WIN32)
        target_link_libraries(solver_addon PRIVATE "${node_lib}")
    elseif(APPLE)
        target_link_options(solver_addon PRIVATE "-undefined" "dynamic_lookup")
    endif()

    if(COMP4050_STATIC_CXX_FLAGS)
        target_link_options(solver_addon PRIVATE ${COMP4050_STATIC_CXX_FLAGS})
    endif()

    if(COMP4050_HIDDEN_VISIBILITY_FLAGS)
        target_compile_options(solver_addon PRIVATE ${COMP4050_HIDDEN_VISIBILITY_FLAGS})
    endif()

    if(COMP4050_STATIC_CXX_FLAGS)
        # The version script exports the two symbols Node looks up and makes
        # every other symbol of the addon local.
        set(COMP4050_ADDON_EXPORTS "${CMAKE_CURRENT_BINARY_DIR}/addon-exports.map")
        file(
            WRITE "${COMP4050_ADDON_EXPORTS}"
            "{\n  global:\n    napi_register_module_v1;\n    node_api_module_get_api_version_v1;\n  local:\n    *;\n};\n"
        )
        target_link_options(
            solver_addon PRIVATE "-Wl,--version-script=${COMP4050_ADDON_EXPORTS}"
        )
    endif()

    if(MSVC)
        target_compile_options(solver_addon PRIVATE /W4)
    else()
        target_compile_options(solver_addon PRIVATE -Wall -Wextra)
    endif()
endif()

# ---- PHP extension ----
option(COMP4050_BUILD_PHP "Build the PHP extension" OFF)
option(COMP4050_PHP_ZTS "Build the PHP extension against a thread-safe PHP" OFF)
set(COMP4050_PHP_INCLUDE_DIR "" CACHE PATH "Directory containing php.h")
set(COMP4050_PHP_LIB "" CACHE FILEPATH "PHP import library (php8.lib or php8ts.lib)")

if(COMP4050_BUILD_PHP)
    set(php_include_dirs)

    if(COMP4050_PHP_INCLUDE_DIR)
        set(php_include_roots "${COMP4050_PHP_INCLUDE_DIR}")
    else()
        # php-config is the only portable way to locate the headers, and it does
        # not exist on Windows, where the development package must be unpacked
        # and COMP4050_PHP_INCLUDE_DIR pointed at its include directory.
        find_program(PHP_CONFIG_EXECUTABLE php-config)

        if(PHP_CONFIG_EXECUTABLE)
            execute_process(
                COMMAND "${PHP_CONFIG_EXECUTABLE}" --includes
                OUTPUT_VARIABLE php_config_includes
                OUTPUT_STRIP_TRAILING_WHITESPACE
                RESULT_VARIABLE php_config_result
            )

            if(php_config_result EQUAL 0)
                string(REGEX MATCHALL "-I[^ ]+" php_config_flags "${php_config_includes}")

                foreach(flag IN LISTS php_config_flags)
                    string(SUBSTRING "${flag}" 2 -1 flag_dir)
                    list(APPEND php_include_roots "${flag_dir}")
                endforeach()
            endif()
        endif()
    endif()

    # php.h sits directly in the include root on unix, but under include/main in
    # the Windows development package, which has no php_config.h at all and uses
    # config.w32.h instead. Probing both keeps the two layouts interchangeable.
    foreach(root IN LISTS php_include_roots)
        if(EXISTS "${root}/php.h")
            list(APPEND php_include_dirs "${root}")
        endif()

        if(EXISTS "${root}/main/php.h")
            list(APPEND php_include_dirs "${root}" "${root}/main")

            # These four are the BASE_INCLUDES PHP's own Windows build uses. The
            # list is not extensible: include/win32 shadows the CRT's time.h and
            # breaks <ctime> for every translation unit.
            foreach(subdir IN ITEMS Zend TSRM ext)
                if(EXISTS "${root}/${subdir}")
                    list(APPEND php_include_dirs "${root}/${subdir}")
                endif()
            endforeach()
        endif()
    endforeach()

    list(REMOVE_DUPLICATES php_include_dirs)

    if(php_include_roots AND NOT php_include_dirs)
        message(FATAL_ERROR "no php.h under ${php_include_roots}")
    endif()

    if(NOT php_include_dirs)
        message(FATAL_ERROR
            "PHP headers not found. Put php-config on PATH, or pass "
            "-DCOMP4050_PHP_INCLUDE_DIR=<directory containing php.h, or its parent on Windows>.")
    endif()

    # The Windows headers mark every zend_* symbol __declspec(dllimport), so the
    # extension must link the import library from the development package. The
    # package keeps it next to include/, as lib/php8.lib for non-thread-safe and
    # lib/php8ts.lib for thread-safe.
    if(WIN32)
        set(php_lib "${COMP4050_PHP_LIB}")

        if(NOT php_lib)
            foreach(candidate IN ITEMS "php8ts.lib" "php8.lib")
                foreach(root IN LISTS php_include_roots)
                    if(EXISTS "${root}/../lib/${candidate}")
                        set(php_lib "${root}/../lib/${candidate}")
                        break()
                    endif()
                endforeach()

                if(php_lib)
                    break()
                endif()
            endforeach()
        endif()

        if(NOT php_lib)
            message(FATAL_ERROR
                "PHP import library not found. Pass -DCOMP4050_PHP_LIB=<path to php8.lib>.")
        endif()
    endif()

    add_library(bionic_solver MODULE src/php/bionic_solver.cpp ${PHP_GENERATED_HEADERS})

    if(WIN32 AND CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
        set(php_compat_header "${CMAKE_CURRENT_BINARY_DIR}/php_compat.h")
        file(WRITE "${php_compat_header}" "#pragma once\n#include <stdint.h>\n#include <limits.h>\n#define LongLongAdd BionicLongLongAdd\n#define LongLongSub BionicLongLongSub\nstatic inline long BionicLongLongAdd(long long a, long long b, long long* out) { if ((b > 0 && a > LLONG_MAX - b) || (b < 0 && a < LLONG_MIN - b)) return -1; *out = a + b; return 0; }\nstatic inline long BionicLongLongSub(long long a, long long b, long long* out) { if ((b < 0 && a > LLONG_MAX + b) || (b > 0 && a < LLONG_MIN + b)) return -1; *out = a - b; return 0; }\n")

        if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
            target_compile_options(bionic_solver PRIVATE "-include" "${php_compat_header}")
        else()
            target_compile_options(bionic_solver PRIVATE "/FI${php_compat_header}")
        endif()
    endif()

    target_include_directories(bionic_solver PRIVATE "${PHP_GENERATED_DIR}")
    target_include_directories(bionic_solver SYSTEM PRIVATE ${php_include_dirs})
    target_link_libraries(bionic_solver PRIVATE solver_core)

    if(WIN32)
        target_link_libraries(bionic_solver PRIVATE "${php_lib}")
    endif()

    target_compile_definitions(bionic_solver PRIVATE
        ZEND_COMPILE_DL_EXT=1
        COMPILE_DL_BIONIC_SOLVER=1
        BIONIC_SOLVER_EXPORTS=1
    )

    if(WIN32)
        # The Windows development package ships no php_config.h; PHP's own build
        # supplies these from the command line, so every extension must as well.
        # Without ZEND_WIN32 the headers reach for a zend_config.h that is absent.
        target_compile_definitions(bionic_solver PRIVATE
            ZEND_WIN32=1
            PHP_WIN32=1
            WIN32
            _MBCS
        )
    endif()

    if(COMP4050_PHP_ZTS)
        target_compile_definitions(bionic_solver PRIVATE ZTS=1)
    endif()

    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        target_compile_definitions(bionic_solver PRIVATE ZEND_DEBUG=1)
    else()
        target_compile_definitions(bionic_solver PRIVATE ZEND_DEBUG=0)
    endif()

    # The extension resolves every zend_* symbol from the hosting PHP binary; on
    # Windows that arrives through the import library linked above, and on unix
    # through the host executable at load time.
    set_target_properties(bionic_solver PROPERTIES PREFIX "" OUTPUT_NAME "bionic_solver")

    if(APPLE)
        target_link_options(bionic_solver PRIVATE "-undefined" "dynamic_lookup")
    endif()

    # php.h expands macros that trip -Wextra, so this target stays quieter than
    # the core. The headers themselves are SYSTEM includes and already silent.
    if(MSVC)
        target_compile_options(bionic_solver PRIVATE /W3)
    else()
        target_compile_options(bionic_solver PRIVATE -Wall)
    endif()
endif()

configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/src/buildinfo.h.in"
    "${CMAKE_CURRENT_BINARY_DIR}/buildinfo.h"
    @ONLY
)
