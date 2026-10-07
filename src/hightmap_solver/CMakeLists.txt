add_library(hightmap_solver STATIC
   backfill.h
   commit_placement.h
   data_normalization.h
   downsize.h
   emit.h
   fits_matrix.h
   group_pack.h
   hightmap_solver.cpp
   item_backfill.h
   item_grouping.h
   item_placement.h
   multistart.h
   packing_types.h
   pre_validation.h
   verify.h                                                   
)
target_include_directories(hightmap_solver PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/..)