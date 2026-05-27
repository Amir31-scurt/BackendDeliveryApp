const mongoose = require("mongoose");

const RestaurantSchema = new mongoose.Schema(
  {
    name: {type: String, required: true},
    description: {type: String, required: true},
    address: {type: String, required: true},
    type: {
      type: String,
      required: true,
      enum: ["restaurant", "boulangerie", "express"],
      default: "restaurant",
    },
    openingHours: {
      monday: {
        open: {type: String, default: "09:00"},
        close: {type: String, default: "00:00"},
      },
      tuesday: {
        open: {type: String, default: "09:00"},
        close: {type: String, default: "00:00"},
      },
      wednesday: {
        open: {type: String, default: "09:00"},
        close: {type: String, default: "00:00"},
      },
      thursday: {
        open: {type: String, default: "09:00"},
        close: {type: String, default: "00:00"},
      },
      friday: {
        open: {type: String, default: "09:00"},
        close: {type: String, default: "00:00"},
      },
      saturday: {
        open: {type: String, default: "09:00"},
        close: {type: String, default: "00:00"},
      },
      sunday: {
        open: {type: String, default: "09:00"},
        close: {type: String, default: "00:00"},
      },
    },
    phoneNumber: {type: String, required: true},
    email: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: (props) => `${props.value} n'est pas un adresse mail valide!`,
      },
    },
    rating: {type: Number, default: 0},
    imageUrl: {type: String},
    menu: [{type: mongoose.Schema.Types.ObjectId, ref: "MenuItem"}],
    isActive: {type: Boolean, default: true},
  },
  {timestamps: true},
);

// Index for text search
RestaurantSchema.index({name: "text", address: "text"});

const Restaurant = mongoose.model("Restaurant", RestaurantSchema);

module.exports = Restaurant;
module.exports.default = Restaurant;
