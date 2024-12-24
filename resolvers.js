import jwt from "jsonwebtoken";
import MenuItem from "./models/MenuItem.js";
import Restaurant from "./models/Restaurant.js";
import User from "./models/User.js";
// import Order from "./models/Order.js";
import authMiddleware from "./middleware/auth.js";

// Function to generate a 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Function to send OTP (replace this with actual SMS sending logic)
const sendOTP = async (phoneNumber, otp) => {
  console.log(`Sending OTP ${otp} to ${phoneNumber}`);
  // Implement your SMS sending logic here
};

const resolvers = {
  Query: {
    me: async (_, __, { req }) => {
      const auth = await authMiddleware(req);
      return User.findById(auth.userId);
    },
    users: async (_, __, { req }) => {
      await authMiddleware(req);
      return User.find();
    },
    user: async (_, { id }, { req }) => {
      await authMiddleware(req);
      return User.findById(id);
    },
    restaurants: async () => Restaurant.find({ isActive: true }),
    restaurant: async (_, { id }) => Restaurant.findById(id),
    menuItems: async (_, { restaurantId }) =>
      MenuItem.find({ restaurant: restaurantId, isAvailable: true }),
    menuItem: async (_, { id }) => MenuItem.findById(id),
    // orders: async (_, __, { req }) => {
    //   const auth = await authMiddleware(req);
    //   return Order.find({ user: auth.userId }).populate('user restaurant items.menuItem');
    // },
    // order: async (_, { id }, { req }) => {
    //   const auth = await authMiddleware(req);
    //   return Order.findOne({ _id: id, user: auth.userId }).populate('user restaurant items.menuItem');
    // },
  },
  Mutation: {
    signup: async (
      _,
      { name, phoneNumber, password, role, vehicleId, zone }
    ) => {
      const existingUser = await User.findOne({ phoneNumber });
      if (existingUser) {
        throw new Error("User with this phone number already exists");
      }

      const otp = generateOTP();
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

      const user = new User({
        name,
        phoneNumber,
        password,
        role,
        otp,
        otpExpires,
        ...(role === "LIVREUR" && { vehicleId, availability: false, zone }),
      });
      await user.save();

      await sendOTP(phoneNumber, otp);

      return {
        message: "OTP sent successfully. Please verify your phone number.",
      };
    },
    verifyOtp: async (_, { phoneNumber, otp }) => {
      const user = await User.findOne({ phoneNumber });
      if (!user) {
        throw new Error("User not found");
      }

      if (user.otp !== otp) {
        throw new Error("Invalid OTP");
      }

      if (user.otpExpires < new Date()) {
        throw new Error("OTP has expired");
      }

      user.isVerified = true;
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save();

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
        expiresIn: "1d",
      });

      return { token, user };
    },
    resendOtp: async (_, { phoneNumber }) => {
      const user = await User.findOne({ phoneNumber });
      if (!user) {
        throw new Error("User not found");
      }

      const otp = generateOTP();
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

      user.otp = otp;
      user.otpExpires = otpExpires;
      await user.save();

      await sendOTP(phoneNumber, otp);

      return { message: "OTP resent successfully" };
    },
    login: async (_, { phoneNumber, password }) => {
      const user = await User.findOne({ phoneNumber });
      if (!user) {
        throw new Error("No user found with this phone number");
      }

      if (!user.isVerified) {
        throw new Error("Please verify your phone number first");
      }

      const valid = await user.comparePassword(password);
      if (!valid) {
        throw new Error("Invalid password");
      }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
        expiresIn: "1d",
      });

      return { token, user };
    },
    createRestaurant: async (_, { input }, { req }) => {
      const auth = await authMiddleware(req);
      if (auth.userRole !== "ADMIN") {
        throw new Error("Not authorized");
      }
      const restaurant = new Restaurant(input);
      await restaurant.save();
      return restaurant;
    },
    updateRestaurant: async (_, { id, input }, { req }) => {
      const auth = await authMiddleware(req);
      if (auth.userRole !== "ADMIN") {
        throw new Error("Not authorized");
      }
      return await Restaurant.findByIdAndUpdate(id, input, { new: true });
    },
    createMenuItem: async (_, { input }, { req }) => {
      const auth = await authMiddleware(req);
      if (auth.userRole !== "ADMIN") {
        throw new Error("Not authorized");
      }
      const menuItem = new MenuItem(input);
      await menuItem.save();
      return menuItem;
    },
    updateMenuItem: async (_, { id, input }, { req }) => {
      const auth = await authMiddleware(req);
      if (auth.userRole !== "ADMIN") {
        throw new Error("Not authorized");
      }
      return await MenuItem.findByIdAndUpdate(id, input, { new: true });
    },
    // createOrder: async (_, { restaurantId, items }, { req }) => {
    //   const auth = await authMiddleware(req);
    //   const orderItems = await Promise.all(items.map(async (item) => {
    //     const menuItem = await MenuItem.findById(item.menuItemId);
    //     return {
    //       menuItem: menuItem._id,
    //       quantity: item.quantity
    //     };
    //   }));

    //   const totalAmount = orderItems.reduce((total, item) => {
    //     return total + (item.menuItem.price * item.quantity);
    //   }, 0);

    //   const order = new Order({
    //     user: auth.userId,
    //     restaurant: restaurantId,
    //     items: orderItems,
    //     totalAmount,
    //     status: 'PENDING',
    //     createdAt: new Date(),
    //   });

    //   await order.save();
    //   return order.populate('user restaurant items.menuItem');
    // },
    // updateOrderStatus: async (_, { orderId, status }, { req }) => {
    //   const auth = await authMiddleware(req);
    //   if (auth.userRole !== 'ADMIN' && auth.userRole !== 'DRIVER') {
    //     throw new Error('Not authorized');
    //   }
    //   const order = await Order.findByIdAndUpdate(orderId, { status }, { new: true }).populate('user restaurant items.menuItem');
    //   return order;
    // },
    toggleRestaurantActive: async (_, { id }, { req }) => {
      const auth = await authMiddleware(req);
      if (auth.userRole !== "ADMIN") {
        throw new Error("Not authorized");
      }
      const restaurant = await Restaurant.findById(id);
      restaurant.isActive = !restaurant.isActive;
      await restaurant.save();
      return restaurant;
    },
    toggleMenuItemAvailable: async (_, { id }, { req }) => {
      const auth = await authMiddleware(req);
      if (auth.userRole !== "ADMIN") {
        throw new Error("Not authorized");
      }
      const menuItem = await MenuItem.findById(id);
      menuItem.isAvailable = !menuItem.isAvailable;
      await menuItem.save();
      return menuItem;
    },
  },
  Restaurant: {
    menu: async (parent) =>
      await MenuItem.find({ restaurant: parent.id, isAvailable: true }),
  },
  MenuItem: {
    restaurant: async (parent) => await Restaurant.findById(parent.restaurant),
  },
};

export default resolvers;
