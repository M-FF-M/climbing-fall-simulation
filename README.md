# Climbing Fall Simulation

This repository contains a webpage which can be used to simulate a climbing fall. Forces and rope stretching are simulated as accurately as possible and the simulation result is displayed using an animation as well as force, energy and position graphs.

The webpage is still work in progress. You can check out the current version at [https://m-ff-m.github.io/climbing-fall-simulation/](https://m-ff-m.github.io/climbing-fall-simulation/).

## License

Copyright © 2025 Fabian Michel

The entire code in this repository is licensed under the [MIT License](LICENSE.md).

## To-Do List

For version 1.0.0:
- decrease the axis legend text size if it covers too much of the available space
- adjust panel numbers for small screens
- publish version 1.0.0

Additional improvements:
- improve slack handling
- add some pre-calculated simulations
- add option to only save the simulation configuration (without the result)
- add proper quickdraws where the carabiner is attached to a fixed point via a sling
- add possibility of a movable belayer attached to a fixed point
- properly implement damping for the rope to get rid of the too-springy behavior
- highlight key moments and calculate key forces (wall / ground impact, maximal force)