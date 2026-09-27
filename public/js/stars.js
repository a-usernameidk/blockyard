// Difficulty stars, like Geometry Dash: every rated level or obby is worth 1 to 10 stars.
//   1-2 Easy, 3-4 Normal, 5-6 Hard, 7-8 Harder, 9 Insane, 10 Demon.
// Beat a rated one (checked by the server) and its stars go on your profile, once per level.
// Built-in levels and obbies are rated here; admins rate player levels and worlds.
export const DIFF_NAMES = ['Unrated', 'Easy', 'Easy', 'Normal', 'Normal', 'Hard', 'Hard', 'Harder', 'Harder', 'Insane', 'Demon'];
export const diffName = (n) => DIFF_NAMES[n] || 'Unrated';
export const diffClass = (n) => 'diff-' + diffName(n).toLowerCase();
export const MAX_STARS = 10;
// keys: built-in 2D level ids, 'w:' + built-in obby id
export const BUILTIN_STARS = {
  'b-hello': 1, 'b-grassy': 1, 'b-steps': 2, 'b-rush': 2,
  'b-boing': 3, 'b-ledge': 3, 'b-stomp': 3, 'b-ringy': 4, 'b-sky': 4, 'b-spike': 4,
  'b-jet': 5, 'b-keep': 5, 'b-tower': 6, 'b-party': 6,
  'b-woods': 6, 'b-mini': 7, 'b-upside': 7, 'b-lava': 8, 'b-final': 8,
  'b-hyper': 9,
  'w:sunny': 2, 'w:tower': 4, 'w:lava': 5, 'w:factory': 6, 'w:sky': 7,
};
export const starsFor = (key) => BUILTIN_STARS[key] || 0;
