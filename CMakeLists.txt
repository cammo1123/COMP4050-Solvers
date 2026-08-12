cmake_minimum_required(VERSION 3.18)
project(COMP4050-Solvers VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Debug CACHE STRING "" FORCE)
endif()

option(COMP4050_BUILD_ADDON "Build the Node.js N-API addon" ON)

# ---- build info ----
find_package(Git QUIET)

set(BUILDINFO_PROJECT_NAME "${PROJECT_NAME}")
set(BUILDINFO_PROJECT_VERSION "${PROJECT_VERSION}")
set(BUILDINFO_PLATFORM "${CMAKE_SYSTEM_NAME}")
set(BUILDINFO_GIT_HASH "unknown")
set(BUILDINFO_GIT_BRANCH "unknown")
set(BUILDINFO_GIT_DIRTY 0)
set(BUILDINFO_BUILD_TIME "")

if(GIT_FOUND)
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" rev-parse --short HEAD
        WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
        OUTPUT_VARIABLE BUILDINFO_GIT_HASH
        OUTPUT_STRIP_TRAILING_WHITESPACE
        RESULT_VARIABLE buildinfo_git_hash_result
    )
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" rev-parse --abbrev-ref HEAD
        WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
        OUTPUT_VARIABLE BUILDINFO_GIT_BRANCH
        OUTPUT_STRIP_TRAILING_WHITESPACE
        RESULT_VARIABLE buildinfo_git_branch_result
    )
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" status --porcelain
        WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
        OUTPUT_VARIABLE buildinfo_git_status
    )

    if(NOT buildinfo_git_hash_result EQUAL 0 OR NOT BUILDINFO_GIT_HASH)
        set(BUILDINFO_GIT_HASH "unknown")
    endif()
    if(NOT buildinfo_git_branch_result EQUAL 0 OR NOT BUILDINFO_GIT_BRANCH)
        set(BUILDINFO_GIT_BRANCH "unknown")
    endif()
    if(buildinfo_git_status)
        set(BUILDINFO_GIT_DIRTY 1)
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

add_library(solvers_core STATIC src/solvers.cpp)
target_include_directories(solvers_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src ${CMAKE_CURRENT_BINARY_DIR})

add_executable(solvers src/main.cpp)
target_link_libraries(solvers PRIVATE solvers_core)

foreach(target solvers_core solvers)
    if(MSVC)
        target_compile_options(${target} PRIVATE /W4)
    else()
        target_compile_options(${target} PRIVATE -Wall -Wextra)
    endif()
endforeach()

if(COMP4050_BUILD_ADDON)
    find_program(NODE_EXECUTABLE node)

    if(NOT NODE_EXECUTABLE)
        message(WARNING "node not found on PATH; skipping the Node.js addon target")
    else()
        function(comp4050_fetch_archive url dest)
            set(archive "${dest}.tar.gz")

            if(NOT EXISTS "${archive}")
                file(DOWNLOAD "${url}" "${archive}")
            endif()

            file(ARCHIVE_EXTRACT INPUT "${archive}" DESTINATION "${dest}")
        endfunction()

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
                )
            endif()
        endif()

        set(napi_dir "${CMAKE_BINARY_DIR}/node-addon-api-8.9.1")

        if(NOT EXISTS "${napi_dir}/napi.h")
            comp4050_fetch_archive(
                "https://github.com/nodejs/node-addon-api/archive/refs/tags/v8.9.1.tar.gz"
                "${CMAKE_BINARY_DIR}"
            )
        endif()

        set(FLATBUFFERS_VERSION "25.12.19")
        set(flatbuffers_dir "${CMAKE_BINARY_DIR}/flatbuffers-${FLATBUFFERS_VERSION}")
        set(flatbuffers_include "${flatbuffers_dir}/flatbuffers-${FLATBUFFERS_VERSION}/include")

        if(NOT EXISTS "${flatbuffers_include}/flatbuffers/flatbuffers.h")
            comp4050_fetch_archive(
                "https://github.com/google/flatbuffers/archive/refs/tags/v${FLATBUFFERS_VERSION}.tar.gz"
                "${flatbuffers_dir}"
            )
        endif()

        set(GENERATED_DIR "${CMAKE_CURRENT_SOURCE_DIR}/native/gen")
        file(GLOB SCHEMA_FILES CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/fbs/*.fbs")

        set(GENERATED_HEADERS)
        foreach(schema IN LISTS SCHEMA_FILES)
            get_filename_component(schema_name "${schema}" NAME_WE)
            list(APPEND GENERATED_HEADERS
                "${GENERATED_DIR}/${schema_name}_generated.h"
                "${GENERATED_DIR}/${schema_name}_translation_generated.h")
        endforeach()

        add_custom_command(
            OUTPUT ${GENERATED_HEADERS}
            COMMAND "${NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/node/scripts/generate.mjs"
            DEPENDS
            ${SCHEMA_FILES}
            "${CMAKE_CURRENT_SOURCE_DIR}/node/scripts/generate.mjs"
            WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
            VERBATIM
        )

        add_library(solvers_addon MODULE src/addon.cpp ${GENERATED_HEADERS})
        target_include_directories(solvers_addon PRIVATE "${node_include}" "${napi_dir}" "${GENERATED_DIR}" "${flatbuffers_include}")
        target_link_libraries(solvers_addon PRIVATE solvers_core)
        set_target_properties(solvers_addon PROPERTIES PREFIX "" OUTPUT_NAME "addon" SUFFIX ".node")

        if(WIN32)
            target_link_libraries(solvers_addon PRIVATE "${node_lib}")
        elseif(APPLE)
            target_link_options(solvers_addon PRIVATE "-undefined" "dynamic_lookup")
        endif()

        if(MSVC)
            target_compile_options(solvers_addon PRIVATE /W4)
        else()
            target_compile_options(solvers_addon PRIVATE -Wall -Wextra)
        endif()
    endif()
endif()

configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/src/buildinfo.h.in"
    "${CMAKE_CURRENT_BINARY_DIR}/buildinfo.h"
    @ONLY
)
