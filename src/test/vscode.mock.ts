export class Position {
	constructor(
		public line: number,
		public character: number
	) {}
}

export class Range {
	constructor(
		public start: Position,
		public end: Position
	) {}
}
