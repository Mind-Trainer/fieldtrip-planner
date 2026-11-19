export type Coordinate = [number, number];
export interface Facility {
  id: string;
  xy: Coordinate;
  tags: Record<string, string>;
  timestamp?: string;
  group: string;
  kind: string;
  offset: number;
  along: number;
}
