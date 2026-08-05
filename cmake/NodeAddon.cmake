# Downloads the Node.js headers and node-addon-api, then defines an N-API
# addon MODULE target. Requires NODE_EXECUTABLE (set via find_program).
#
#   comp4050_add_node_addon(<target> <source>...)
#
# On Windows the target links against the node.lib matching the running node,
# and on macOS it links with -undefined dynamic_lookup (N-API symbols resolve
# from the node executable at load time).

function(comp4050_add_node_addon target)
    set(sources ${ARGN})

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

    # Node headers: <https://nodejs.org/download/release/vX.Y.Z/node-vX.Y.Z-headers.tar.gz>
    set(node_dir "${CMAKE_BINARY_DIR}/node-v${node_version}")
    set(node_include "${node_dir}/node-v${node_version}/include/node")

    if(NOT EXISTS "${node_include}/node_api.h")
        set(node_archive "${CMAKE_BINARY_DIR}/node-v${node_version}-headers.tar.gz")
        if(NOT EXISTS "${node_archive}")
            set(node_url "https://nodejs.org/download/release/v${node_version}/node-v${node_version}-headers.tar.gz")
            message(STATUS "Downloading Node.js headers: ${node_url}")
            file(DOWNLOAD "${node_url}" "${node_archive}")
        endif()
        message(STATUS "Extracting Node.js headers to ${node_dir}")
        file(ARCHIVE_EXTRACT INPUT "${node_archive}" DESTINATION "${node_dir}")
    endif()

    # Windows import library (not shipped inside the headers archive).
    set(node_lib "")
    if(WIN32)
        if(node_arch STREQUAL "ia32")
            set(win_arch "x86")
        else()
            set(win_arch "${node_arch}")
        endif()
        set(node_lib "${node_dir}/win-${win_arch}/node.lib")
        if(NOT EXISTS "${node_lib}")
            set(node_lib_url "https://nodejs.org/download/release/v${node_version}/win-${win_arch}/node.lib")
            message(STATUS "Downloading node.lib: ${node_lib_url}")
            file(DOWNLOAD "${node_lib_url}" "${node_lib}")
        endif()
    endif()

    # node-addon-api (header-only), pinned to the version npm would install.
    set(napi_dir "${CMAKE_BINARY_DIR}/node-addon-api-8.9.1")
    if(NOT EXISTS "${napi_dir}/napi.h")
        set(napi_archive "${CMAKE_BINARY_DIR}/node-addon-api-8.9.1.tar.gz")
        if(NOT EXISTS "${napi_archive}")
            message(STATUS "Downloading node-addon-api v8.9.1")
            file(DOWNLOAD
                "https://github.com/nodejs/node-addon-api/archive/refs/tags/v8.9.1.tar.gz"
                "${napi_archive}"
                EXPECTED_HASH SHA256=90F1B76BC88A2C459FA5166F3CCF5B64E0F52D92E811E31371DE41C5F5A73F74
            )
        endif()
        message(STATUS "Extracting node-addon-api to ${CMAKE_BINARY_DIR}")
        file(ARCHIVE_EXTRACT INPUT "${napi_archive}" DESTINATION "${CMAKE_BINARY_DIR}")
    endif()

    # N-API addon, loaded by node as a module (addon.node).
    add_library(${target} MODULE ${sources})
    target_include_directories(${target} PRIVATE "${node_include}" "${napi_dir}")
    set_target_properties(${target} PROPERTIES PREFIX "" OUTPUT_NAME "addon" SUFFIX ".node")
    if(WIN32)
        target_link_libraries(${target} PRIVATE "${node_lib}")
    elseif(APPLE)
        target_link_options(${target} PRIVATE "-undefined" "dynamic_lookup")
    endif()
endfunction()
