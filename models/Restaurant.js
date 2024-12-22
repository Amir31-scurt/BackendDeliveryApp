import mongoose from "mongoose";

const RestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  address: { type: String, required: true },
  cuisine: { type: String, required: true },
  openingHours: {
    monday: { open: String, close: String },
    tuesday: { open: String, close: String },
    wednesday: { open: String, close: String },
    thursday: { open: String, close: String },
    friday: { open: String, close: String },
    saturday: { open: String, close: String },
    sunday: { open: String, close: String },
  },
  phoneNumber: { type: String, required: true },
  email: { type: String, required: true },
  rating: { type: Number, default: 0 },
  imageUrl: { type: String },
  isActive: { type: Boolean, default: true },
});

const Restaurant = mongoose.model("Restaurant", RestaurantSchema);

export default Restaurant;
