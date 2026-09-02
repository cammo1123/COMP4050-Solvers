add_library(php_solver STATIC
    model.cpp
    orientation.cpp
    packer.cpp
    stability.cpp
    void_finder.cpp
    model.h
    orientation.h
    packer.h
    stability.h
    void_finder.h
)
target_include_directories(php_solver PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/..)
