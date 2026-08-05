cmake_minimum_required(VERSION 3.18)

project(COMP4050-Solvers VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Debug CACHE STRING "Build type" FORCE)
endif()

option(COMP4050_BUILD_ADDON "Build the Node.js N-API addon" ON)

include(cmake/Deps.cmake)

# Core solver logic, shared by the Node addon and the standalone binary.
add_library(solvers_core STATIC src/solvers.cpp)
target_include_directories(solvers_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(solvers_core PUBLIC nlohmann_json::nlohmann_json)

# Standalone binary: plain main() entry point, no Node bindings.
add_executable(solvers src/main.cpp)
target_link_libraries(solvers PRIVATE solvers_core)
target_compile_definitions(solvers PRIVATE STANDALONE)

if(MSVC)
    target_compile_options(solvers_core PRIVATE /W4)
    target_compile_options(solvers PRIVATE /W4)
else()
    target_compile_options(solvers_core PRIVATE -Wall -Wextra)
    target_compile_options(solvers PRIVATE -Wall -Wextra)
endif()

# Node.js addon (N-API). Disable with -DCOMP4050_BUILD_ADDON=OFF or one of the
# "core" presets. Requires a node executable to resolve the matching headers.
if(COMP4050_BUILD_ADDON)
    find_program(NODE_EXECUTABLE node)

    if(NOT NODE_EXECUTABLE)
        message(WARNING "node not found on PATH; skipping the Node.js addon target")
    else()
        include(cmake/NodeAddon.cmake)
        comp4050_add_node_addon(solvers_addon src/addon.cpp)
        target_link_libraries(solvers_addon PRIVATE solvers_core)

        if(MSVC)
            target_compile_options(solvers_addon PRIVATE /W4)
        else()
            target_compile_options(solvers_addon PRIVATE -Wall -Wextra)
        endif()
    endif()
endif()
