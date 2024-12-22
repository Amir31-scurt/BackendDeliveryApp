import { gql } from "apollo-server-express";

const typeDefs = gql`
  type User {
    id: ID!
    name: String!
    phoneNumber: String!
    role: String!
    isVerified: Boolean!
    profilePicture: String
    vehicleId: String
    availability: Boolean
    zone: String
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type OtpResponse {
    message: String!
  }

  type Restaurant {
    id: ID!
    name: String!
    description: String!
    address: String!
    cuisine: String!
    openingHours: OpeningHours!
    phoneNumber: String!
    rating: Float!
    imageUrl: String
    isActive: Boolean!
    menu: [MenuItem!]!
  }

  type OpeningHours {
    monday: DailyHours!
    tuesday: DailyHours!
    wednesday: DailyHours!
    thursday: DailyHours!
    friday: DailyHours!
    saturday: DailyHours!
    sunday: DailyHours!
  }

  type DailyHours {
    open: String!
    close: String!
  }

  type MenuItem {
    id: ID!
    name: String!
    description: String!
    price: Float!
    category: String!
    restaurant: Restaurant!
    imageUrl: String
    ingredients: [String!]!
    nutritionalInfo: NutritionalInfo
    isVegetarian: Boolean!
    isVegan: Boolean!
    isGlutenFree: Boolean!
    isAvailable: Boolean!
  }

  type NutritionalInfo {
    calories: Int
    protein: Float
    carbs: Float
    fat: Float
  }

  type Order {
    id: ID!
    user: User!
    restaurant: Restaurant!
    items: [OrderItem!]!
    totalAmount: Float!
    status: String!
    createdAt: String!
  }

  type OrderItem {
    menuItem: MenuItem!
    quantity: Int!
  }

  input RestaurantInput {
    name: String!
    description: String!
    address: String!
    cuisine: String!
    openingHours: OpeningHoursInput!
    phoneNumber: String!
    imageUrl: String
  }

  input OpeningHoursInput {
    monday: DailyHoursInput!
    tuesday: DailyHoursInput!
    wednesday: DailyHoursInput!
    thursday: DailyHoursInput!
    friday: DailyHoursInput!
    saturday: DailyHoursInput!
    sunday: DailyHoursInput!
  }

  input DailyHoursInput {
    open: String!
    close: String!
  }

  input MenuItemInput {
    name: String!
    description: String!
    price: Float!
    category: String!
    restaurantId: ID!
    imageUrl: String
    ingredients: [String!]!
    nutritionalInfo: NutritionalInfoInput
    isVegetarian: Boolean!
    isVegan: Boolean!
    isGlutenFree: Boolean!
  }

  input NutritionalInfoInput {
    calories: Int
    protein: Float
    carbs: Float
    fat: Float
  }

  input OrderItemInput {
    menuItemId: ID!
    quantity: Int!
  }

  type Query {
    me: User
    users: [User!]!
    user(id: ID!): User
    restaurants: [Restaurant!]!
    restaurant(id: ID!): Restaurant
    menuItems(restaurantId: ID!): [MenuItem!]!
    menuItem(id: ID!): MenuItem
    orders: [Order!]!
    order(id: ID!): Order
  }

  type Mutation {
    signup(
      name: String!
      phoneNumber: String!
      password: String!
      role: String!
    ): OtpResponse!
    verifyOtp(phoneNumber: String!, otp: String!): AuthPayload!
    resendOtp(phoneNumber: String!): OtpResponse!
    login(phoneNumber: String!, password: String!): AuthPayload!
    createRestaurant(input: RestaurantInput!): Restaurant!
    updateRestaurant(id: ID!, input: RestaurantInput!): Restaurant!
    createMenuItem(input: MenuItemInput!): MenuItem!
    updateMenuItem(id: ID!, input: MenuItemInput!): MenuItem!
    createOrder(restaurantId: ID!, items: [OrderItemInput!]!): Order!
    updateOrderStatus(orderId: ID!, status: String!): Order!
    toggleRestaurantActive(id: ID!): Restaurant!
    toggleMenuItemAvailable(id: ID!): MenuItem!
  }
`;

export default typeDefs;
