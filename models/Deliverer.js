import mongoose from "mongoose";

const delivererSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  vehicleId: { type: String, required: true },
  isAvailable: { type: Boolean, default: true },
  currentLocation: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: [0, 0] },
  },
  zone: { type: String },
  profilePicture: { type: String },
  isActive: { type: Boolean, default: true },
});

// Create geospatial index for the `currentLocation` field
delivererSchema.index({ currentLocation: "2dsphere" });

const Deliverer = mongoose.model("Deliverer", delivererSchema);

export default Deliverer;
