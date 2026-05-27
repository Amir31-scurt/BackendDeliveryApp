const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: {type: String, required: true},
  phoneNumber: {type: String, required: true, unique: true},
  password: {type: String, required: true},
  role: {
    type: String,
    enum: ["customer", "admin", "deliverer"],
    default: "customer",
  },
  otp: {type: String},
  otpExpires: {type: Date},
  isVerified: {type: Boolean, default: false},
  profilePicture: {type: String},
  address: {type: String},
});

const DelivererSchema = new mongoose.Schema({
  userId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
  vehicleId: {type: String, required: true},
  isAvailable: {type: Boolean, default: true},
  currentLocation: {
    type: {type: String, enum: ["Point"], default: "Point"},
    coordinates: {type: [Number], default: [0, 0]},
  },
  zone: {type: String},
});

DelivererSchema.index({currentLocation: "2dsphere"});

UserSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

UserSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", UserSchema);
const Deliverer = mongoose.model("Deliverer", DelivererSchema);

module.exports = {User, Deliverer};
module.exports.User = User;
module.exports.Deliverer = Deliverer;
