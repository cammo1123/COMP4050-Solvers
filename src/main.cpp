#include <cstddef>
#include <iomanip>
#include <iostream>

#include "solve_domain_generated.h"
#include "solver.h"

using namespace fbs::domain;

int main()
{
	auto const build_info = solver::info();
	std::cout << build_info.project_name << " " << build_info.project_version;
	std::cout << " (" << build_info.build_type << ")\n";
	std::cout << "  git: " << build_info.git_hash << " (" << build_info.git_branch << ")\n";
	std::cout << "  built: " << build_info.build_time << "\n";
	std::cout << "  platform: " << build_info.platform << " " << build_info.arch << "\n";
	std::cout << "  compiler: " << build_info.compiler << "\n";
	std::cout << "  node: " << build_info.node_version << '\n';

	SolveRequest solve = { };

	solve.boxes.push_back({
		.reference = "Small",
		.width = 10,
		.length = 10,
		.depth = 10,

		.maximum_boxes = 2,
	});

	solve.boxes.push_back({
		.reference = "Medium",
		.width = 50,
		.length = 50,
		.depth = 50,
		.outer_width = 54,
		.outer_length = 54,
		.outer_depth = 54,
	});

	solve.boxes.push_back({
		.reference = "Large",
		.width = 100,
		.length = 100,
		.depth = 100,
	});

	solve.algorithm = SolveAlgorithm::PHPSolver;

	fbs::domain::SolveOptions options;
	options.php_solver_options = fbs::domain::PHPSolverOptions {
		.balance_weight = true,
		.best_subset = false,
	};
	solve.options = options;

	fbs::domain::ItemType linked_a;
	linked_a.item_code = "LinkedA";
	linked_a.item_reference = "LinkedA";
	linked_a.width = 5;
	linked_a.length = 5;
	linked_a.depth = 5;
	linked_a.weight = 1;
	linked_a.linked_group = "demo-pair";
	linked_a.rotation_policy = RotationPolicy::KeepFlat;
	linked_a.constraint = fbs::domain::PlacementConstraint { };
	linked_a.constraint->no_stacking = true;
	solve.items.push_back(linked_a);

	fbs::domain::ItemType linked_b = linked_a;
	linked_b.item_code = "LinkedB";
	linked_b.item_reference = "LinkedB";
	solve.items.push_back(linked_b);

	for (auto i = 1; i <= 65; i++) {
		solve.items.push_back({
			.item_code = std::string("S") + std::to_string(i),
			.item_reference = std::string("Small") + std::to_string(i),
			.width = 1,
			.length = 1,
			.depth = 1,
			.weight = 1,
		});
	}

	for (auto i = 1; i <= 25; i++) {
		solve.items.push_back({
			.item_code = std::string("M") + std::to_string(i),
			.item_reference = std::string("Medium") + std::to_string(i),
			.width = 10,
			.length = 10,
			.depth = 10,
			.weight = 10,
		});
	}

	for (auto i = 1; i <= 1000; i++) {
		solve.items.push_back({
			.item_code = std::string("L") + std::to_string(i),
			.item_reference = std::string("Large") + std::to_string(i),
			.width = 50,
			.length = 50,
			.depth = 50,
			.weight = 50,
		});
	}

	std::cout << "\033[?25l";
	auto res = solver::solve(solve, [](size_t done, size_t total) {
		if (total == 0)
			return;

		constexpr int barWidth = 40;
		float progress = static_cast<float>(done) / total;
		int filled = static_cast<int>(progress * barWidth);

		std::string bar(filled, '#');
		bar += std::string(barWidth - filled, '-');

		std::cout << "\r[" << bar << "] "
				  << std::fixed << std::setprecision(1)
				  << (progress * 100.0f) << "% "
				  << "(" << done << "/" << total << ")"
				  << std::flush;
	});
	std::cout << "\033[?25h\n";

	auto f = res.failed.size();
	int i = 0;
	for (auto const& result : res.results) {
		i += result.placements.size();
	}

	std::cout << "Total : " << i << " items\n";
	std::cout << "Failed: " << f << " items\n";

	return 0;
}
