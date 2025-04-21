import mongoose from "mongoose";

const MenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  category: {
    type: String,
    required: true,
    enum: ["PLAT", "FASTFOOD", "GRILLADE", "PAINS", "VIENNOISERIES", "PATISSERIE", "EXPRESS", "GOURMET", "DESSERT"],
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
  },
  imageUrl: { type: String },
  isAvailable: { type: Boolean, default: true },
});

const MenuItem = mongoose.model("MenuItem", MenuItemSchema);

export default MenuItem;
