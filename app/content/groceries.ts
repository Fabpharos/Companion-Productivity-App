// Store sections in the order a shop is usually walked, and the words quick
// capture recognises as groceries. Plain data: add a word to a section and
// capture starts sorting it there.

export const OTHER_SECTION = "Other";

export const SECTIONS: Record<string, string[]> = {
  Produce: [
    "apple", "avocado", "banana", "basil", "bean sprout", "beet", "bell pepper", "berry", "blueberry", "bok choy",
    "broccoli", "cabbage", "carrot", "cauliflower", "celery", "cherry", "cilantro", "corn", "cucumber", "eggplant",
    "fruit", "garlic", "ginger", "grape", "green bean", "green onion", "herb", "jalapeno", "kale", "lemon", "lettuce",
    "lime", "mango", "melon", "mushroom", "onion", "orange", "parsley", "peach", "pear", "pepper", "pineapple",
    "potato", "raspberry", "salad", "scallion", "shallot", "spinach", "squash", "strawberry", "sweet potato",
    "tomato", "vegetable", "veggie", "watermelon", "zucchini",
  ],
  Bakery: ["bagel", "baguette", "bread", "bun", "croissant", "donut", "muffin", "pita", "roll", "tortilla"],
  "Meat & fish": [
    "bacon", "beef", "chicken", "chicken breast", "chicken thigh", "fish", "ground beef", "ground turkey", "ham",
    "hot dog", "lamb", "meat", "pork", "salmon", "sausage", "shrimp", "steak", "tilapia", "tuna", "turkey",
  ],
  "Dairy & eggs": [
    "butter", "cheddar", "cheese", "cottage cheese", "cream", "cream cheese", "creamer", "egg", "half and half",
    "milk", "mozzarella", "parmesan", "sour cream", "tofu", "yogurt",
  ],
  Frozen: ["dumpling", "frozen fruit", "frozen pizza", "frozen vegetable", "fry", "ice", "ice cream", "popsicle", "waffle"],
  Pantry: [
    "baking powder", "baking soda", "bean", "black bean", "bouillon", "broth", "brown sugar", "cereal", "chickpea",
    "cinnamon", "cooking spray", "flour", "granola", "honey", "hot sauce", "jam", "jelly", "ketchup", "lentil",
    "maple syrup", "mayo", "mayonnaise", "mustard", "noodle", "oat", "oatmeal", "oil", "olive oil", "pasta",
    "pasta sauce", "peanut butter", "ramen", "rice", "salsa", "salt", "seasoning", "soup", "soy sauce", "spaghetti",
    "spice", "stock", "sugar", "syrup", "tomato sauce", "vanilla", "vinegar", "yeast",
  ],
  Snacks: [
    "almond", "candy", "cashew", "chip", "chocolate", "cookie", "cracker", "granola bar", "gum", "nut", "peanut",
    "popcorn", "pretzel", "protein bar", "trail mix",
  ],
  Drinks: [
    "beer", "coffee", "coke", "energy drink", "juice", "kombucha", "lemonade", "orange juice", "seltzer", "soda",
    "sparkling water", "tea", "water", "wine",
  ],
  Household: [
    "aluminum foil", "battery", "bleach", "detergent", "dish soap", "dishwasher pod", "dryer sheet", "foil",
    "laundry detergent", "light bulb", "napkin", "paper towel", "parchment paper", "plastic wrap", "sponge",
    "tissue", "toilet paper", "trash bag", "ziploc",
  ],
  "Personal care": [
    "body wash", "conditioner", "contact solution", "cotton swab", "deodorant", "floss", "hand soap", "lotion",
    "mouthwash", "razor", "shampoo", "shaving cream", "soap", "sunscreen", "toothbrush", "toothpaste", "vitamin",
  ],
};

export const SECTION_ORDER: string[] = [...Object.keys(SECTIONS), OTHER_SECTION];
