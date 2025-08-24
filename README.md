# Climbing Fall Simulation

This repository contains a webpage which can be used to simulate a climbing fall. Forces and rope stretching are simulated as accurately as possible and the simulation result is displayed using an animation as well as force, energy and position graphs.

The webpage is still work in progress. You can check out the current version at [https://m-ff-m.github.io/climbing-fall-simulation/](https://m-ff-m.github.io/climbing-fall-simulation/).

## License

Copyright © 2025 Fabian Michel

The entire code in this repository is licensed under the [MIT License](LICENSE.md).

## To-Do List

- add additional info text regarding the choice of the physics engine step size, which should take current rope length and segment number into account
- add menu for choosing which pane displays what and additional settings
- add legends for the different types of force and energy graphs per object
- ensure that color dot and text in legend are not separated by line break
- add a speed graph
- add additional setup options such as elasticity constant
- decrease the axis legend text size if it covers too much of the available space
- adjust element sizes and numbers for small screens and touch devices
- adjust slider thickness for touch devices
- add the option to store simulation results in-browser and to download and upload them
- add proper quickdraws where the carabiner is attached to a fixed point via a sling
- add possibility of a movable belayer attached to a fixed point
- properly implement damping for the rope to get rid of the too-springy behavior
- highlight key moments and calculate key forces (wall / ground impact, maximal force)