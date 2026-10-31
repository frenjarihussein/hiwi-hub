import { expect, it } from 'vitest';
import { sortSolarRows } from './solar-sort';
it('orders capacities in both directions with missing values last', () => {
  const rows = [{capacity:20},{capacity:null},{capacity:5}];
  expect(sortSolarRows(rows,r => r.capacity).map(r => r.capacity)).toEqual([5,20,null]);
  expect(sortSolarRows(rows,r => r.capacity,true).map(r => r.capacity)).toEqual([20,5,null]);
});
it('orders names without changing the source', () => {
  const rows = [{name:'B'},{name:'A'}];
  expect(sortSolarRows(rows,r => r.name).map(r => r.name)).toEqual(['A','B']);
  expect(rows[0]?.name).toBe('B');
});