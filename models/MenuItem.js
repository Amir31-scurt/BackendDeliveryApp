import mongoose from "mongoose";

const MenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  category: {
    type: String,
    required: true,
    enum: ["PLAT", "FASTFOOD", "GRILLADE"],
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
  },
  imageUrl: { type: String },
  // ingredients: [{ type: String }],
  // nutritionalInfo: {
  //   calories: Number,
  //   protein: Number,
  //   carbs: Number,
  //   fat: Number,
  // },
  // isVegetarian: { type: Boolean, default: false },
  // isVegan: { type: Boolean, default: false },
  // isGlutenFree: { type: Boolean, default: false },
  isAvailable: { type: Boolean, default: true },
});

const MenuItem = mongoose.model("MenuItem", MenuItemSchema);

export default MenuItem;
