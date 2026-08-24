cmake_minimum_required(VERSION 3.24)

if(POLICY CMP0167)
  cmake_policy(SET CMP0167 NEW)
  set(CMAKE_POLICY_DEFAULT_CMP0167 NEW)
endif()

project(cloud_vdb_author LANGUAGES CXX)

if(APPLE AND EXISTS "/opt/homebrew/opt/openvdb/lib/cmake/OpenVDB")
  list(APPEND CMAKE_MODULE_PATH "/opt/homebrew/opt/openvdb/lib/cmake/OpenVDB")
endif()
find_package(OpenVDB REQUIRED)

add_executable(cloud-vdb-author cloud_vdb_author.cpp)
target_compile_features(cloud-vdb-author PRIVATE cxx_std_20)
target_link_libraries(cloud-vdb-author PRIVATE OpenVDB::openvdb)
target_compile_options(cloud-vdb-author PRIVATE -Wall -Wextra -Wpedantic)
