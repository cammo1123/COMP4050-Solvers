#include <cstdlib>
#include <iostream>

#include "solvers.h"

int main(int argc, char** argv)
{
	std::cout << solvers::hello() << std::endl;

	if (argc > 1) {
		double value = std::strtod(argv[1], nullptr);
		std::cout << solvers::doubleValue(value) << std::endl;
	}

	return 0;
}
