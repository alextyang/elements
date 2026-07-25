# Lunar rendering sources

The lunar albedo and elevation textures in this directory come from NASA's
Scientific Visualization Studio [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/).
They are derived from Lunar Reconnaissance Orbiter Camera (LROC) imagery and
Lunar Orbiter Laser Altimeter (LOLA) elevation data.

Credit: NASA's Scientific Visualization Studio; visualization by Ernie Wright
(USRA), with Noah Petro (NASA/GSFC) as scientist.

For 2026, the app also requests the matching frame from NASA SVS's
[Moon Phase and Libration, 2026](https://svs.gsfc.nasa.gov/5587/) animation.
Those immutable hourly frames incorporate the observed phase, libration,
position angle, apparent diameter, LROC surface imagery, LOLA terrain shadows,
and earthshine. They are cached through the app's same-origin Moon endpoint and
uploaded into WebGL; the local CGI Moon Kit shader remains the fallback.
