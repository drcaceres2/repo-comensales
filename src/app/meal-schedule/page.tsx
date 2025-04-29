"use client";

import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";

const meals = [
  {
    day: "Monday",
    breakfast: "Cereal with Milk",
    lunch: "Pasta with Tomato Sauce",
    dinner: "Chicken and Rice",
  },
  {
    day: "Tuesday",
    breakfast: "Toast with Jam",
    lunch: "Sandwich",
    dinner: "Pizza",
  },
  {
    day: "Wednesday",
    breakfast: "Yogurt with Granola",
    lunch: "Salad",
    dinner: "Burger and Fries",
  },
  {
    day: "Thursday",
    breakfast: "Pancakes",
    lunch: "Soup",
    dinner: "Tacos",
  },
  {
    day: "Friday",
    breakfast: "Oatmeal",
    lunch: "Sushi",
    dinner: "Steak and Potatoes",
  },
  {
    day: "Saturday",
    breakfast: "Waffles",
    lunch: "Ramen",
    dinner: "Lasagna",
  },
  {
    day: "Sunday",
    breakfast: "Eggs and Bacon",
    lunch: "Burrito",
    dinner: "Roast Chicken",
  },
];

export default function MealSchedulePage() {
  return (
    <div className="flex items-center justify-center min-h-screen py-2">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-2xl">Weekly Meal Schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {meals.map((meal, index) => (
            <div
              key={index}
              className="border rounded-md p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold mb-2">{meal.day}</h2>
              <p>
                <span className="font-medium">Breakfast:</span> {meal.breakfast}
              </p>
              <p>
                <span className="font-medium">Lunch:</span> {meal.lunch}
              </p>
              <p>
                <span className="font-medium">Dinner:</span> {meal.dinner}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
