import type { Restaurant, RestaurantPageResult } from "./restaurants";

export const RESTAURANT_DISPLAY_COUNTS = [5, 10, 15, 20] as const;
export const DEFAULT_RESTAURANT_DISPLAY_COUNT = 20;
export type RestaurantDisplayCount = typeof RESTAURANT_DISPLAY_COUNTS[number];

export type RestaurantListState = {
  restaurants: Restaurant[];
  remaining: Restaurant[];
  seenIds: string[];
  nextStart: number | null;
};

export function createRestaurantList(
  page: RestaurantPageResult,
  count: RestaurantDisplayCount = DEFAULT_RESTAURANT_DISPLAY_COUNT
): RestaurantListState {
  return resizeRestaurantList({
    restaurants: [...page.restaurants],
    remaining: [],
    seenIds: page.restaurants.map((restaurant) => restaurant.id),
    nextStart: page.nextStart,
  }, count);
}

export function resizeRestaurantList(state: RestaurantListState, count: RestaurantDisplayCount): RestaurantListState {
  if (!RESTAURANT_DISPLAY_COUNTS.includes(count)) throw new RangeError("Invalid restaurant display count");
  if (count < state.restaurants.length) {
    return {
      ...state,
      restaurants: state.restaurants.slice(0, count),
      remaining: [...state.restaurants.slice(count), ...state.remaining],
    };
  }
  const needed = count - state.restaurants.length;
  return {
    ...state,
    restaurants: [...state.restaurants, ...state.remaining.slice(0, needed)],
    remaining: state.remaining.slice(needed),
  };
}

export function addRestaurantPage(state: RestaurantListState, page: RestaurantPageResult): RestaurantListState {
  const seenIds = new Set(state.seenIds);
  const remaining = [...state.remaining];
  for (const restaurant of page.restaurants) {
    if (!seenIds.has(restaurant.id)) {
      seenIds.add(restaurant.id);
      remaining.push(restaurant);
    }
  }
  return { ...state, remaining, seenIds: [...seenIds], nextStart: page.nextStart };
}

export function replaceRestaurantList(
  state: RestaurantListState,
  targetId: string | null
): { state: RestaurantListState; replaced: number } {
  const remaining = [...state.remaining];
  let replaced = 0;
  const restaurants = state.restaurants.map((restaurant) => {
    if (targetId !== null && restaurant.id !== targetId) return restaurant;
    const replacement = remaining.shift();
    if (!replacement) return restaurant;
    replaced += 1;
    return replacement;
  });
  return { state: { ...state, restaurants, remaining }, replaced };
}
