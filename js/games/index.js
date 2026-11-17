import { holdem, omaha } from './holdem.js';
import { stud } from './stud.js';
import { draw } from './draw.js';
import { videopoker } from './videopoker.js';
import { blackjack } from './blackjack.js';
import { threecard } from './threecard.js';
import { baccarat } from './baccarat.js';

export const GAMES = [holdem, omaha, stud, draw, blackjack, videopoker, threecard, baccarat];
