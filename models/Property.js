const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  location: { type: String, required: true, trim: true },
  type: { type: String, enum: ["house", "apartment", "condo", "land"], required: true },
  amenities: [{ type: String, trim: true }],
  images: [{ url: String, public_id: String }],
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  bedrooms: { type: Number, default: 0, min: 0 },
  bathrooms: { type: Number, default: 0, min: 0 },
  squareFootage: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ["active", "sold", "rented", "pending"], default: "active" },
  views: { type: Number, default: 0, min: 0 },
  locationCoordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [longitude, latitude]
  }
});

// Indexes for performance
propertySchema.index({ locationCoordinates: '2dsphere' }); // Geospatial index
propertySchema.index({ title: 'text', description: 'text' }); // Full-text search
propertySchema.index({ agent: 1 }); // Index for agent-based queries

module.exports = mongoose.model("Property", propertySchema);
