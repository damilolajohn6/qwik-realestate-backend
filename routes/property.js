const express = require("express");
const router = express.Router();
const Property = require("../models/Property");
const { protect, agent, admin } = require("../middleware/auth");
const { validateProperty } = require("../middleware/validateProperty");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const sanitize = require("mongo-sanitize");
const mongoose = require("mongoose");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "realestate/properties",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 800, quality: "auto", fetch_format: "auto" }],
  },
});

const upload = multer({ storage });

/**
 * @swagger
 * /api/properties:
 *   get:
 *     summary: Get all properties with filters
 *     tags: [Properties]
 *     parameters:
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by location
 *       - in: query
 *         name: priceMin
 *         schema:
 *           type: number
 *         description: Minimum price
 *       - in: query
 *         name: priceMax
 *         schema:
 *           type: number
 *         description: Maximum price
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [house, apartment, condo, land]
 *         description: Property type
 *       - in: query
 *         name: amenities
 *         schema:
 *           type: string
 *         description: Comma-separated amenities
 *       - in: query
 *         name: bedrooms
 *         schema:
 *           type: number
 *         description: Number of bedrooms
 *       - in: query
 *         name: bathrooms
 *         schema:
 *           type: number
 *         description: Number of bathrooms
 *       - in: query
 *         name: squareFootageMin
 *         schema:
 *           type: number
 *         description: Minimum square footage
 *       - in: query
 *         name: squareFootageMax
 *         schema:
 *           type: number
 *         description: Maximum square footage
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Full-text search query
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         description: Latitude for geospatial query
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *         description: Longitude for geospatial query
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *         description: Radius in kilometers for geospatial query
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of properties per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of properties
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *                 properties:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Property'
 *       500:
 *         description: Server error
 */
router.get("/", async (req, res) => {
  const {
    location,
    priceMin,
    priceMax,
    type,
    amenities,
    bedrooms,
    bathrooms,
    squareFootageMin,
    squareFootageMax,
    search,
    lat,
    lng,
    radius,
    page = 1,
    limit = 10,
    sort = "createdAt",
    order = "desc",
  } = req.query;

  let query = {};

  // Sanitize inputs
  Object.keys(req.query).forEach((key) => {
    req.query[key] = sanitize(req.query[key]);
  });

  // Full-text search
  if (search) {
    query.$text = { $search: search };
  }

  // Geospatial query
  if (lat && lng && radius) {
    query.locationCoordinates = {
      $near: {
        $geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] },
        $maxDistance: Number(radius) * 1000, // Radius in meters
      },
    };
  }

  if (location) query.location = new RegExp(location, "i");
  if (type) query.type = type;
  if (amenities)
    query.amenities = { $all: amenities.toString().split(",").map((a) => a.trim()) };
  if (bedrooms) query.bedrooms = Number(bedrooms);
  if (bathrooms) query.bathrooms = Number(bathrooms);

  if (priceMin || priceMax) {
    query.price = {};
    if (priceMin) query.price.$gte = Number(priceMin);
    if (priceMax) query.price.$lte = Number(priceMax);
  }

  if (squareFootageMin || squareFootageMax) {
    query.squareFootage = {};
    if (squareFootageMin) query.squareFootage.$gte = Number(squareFootageMin);
    if (squareFootageMax) query.squareFootage.$lte = Number(squareFootageMax);
  }

  try {
    const total = await Property.countDocuments(query);
    const properties = await Property.find(query)
      .sort({ [sort]: order === "desc" ? -1 : 1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .populate("agent", "name email");

    const response = {
      success: true,
      count: properties.length,
      total,
      page: +page,
      pages: Math.ceil(total / +limit),
      properties,
    };

    res.json(response);
  } catch (err) {
    console.error("Error fetching properties:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @swagger
 * /api/properties:
 *   post:
 *     summary: Create a new property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               location:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [house, apartment, condo, land]
 *               amenities:
 *                 type: string
 *               bedrooms:
 *                 type: number
 *               bathrooms:
 *                 type: number
 *               squareFootage:
 *                 type: number
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Property created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 property:
 *                   $ref: '#/components/schemas/Property'
 *       500:
 *         description: Server error
 */
router.post(
  "/",
  protect,
  agent,
  upload.array("images", 5),
  validateProperty,
  async (req, res) => {
    const { title, description, price, location, type, amenities, bedrooms, bathrooms, squareFootage, lat, lng } = req.body;

    try {
      const images = req.files.map((file) => ({
        url: file.path,
        public_id: file.filename,
      }));

      const property = await Property.create({
        title,
        description,
        price: Number(price),
        location,
        type,
        amenities: amenities ? amenities.split(",").map((a) => a.trim()) : [],
        images,
        agent: req.user._id,
        bedrooms: Number(bedrooms) || 0,
        bathrooms: Number(bathrooms) || 0,
        squareFootage: Number(squareFootage) || 0,
        locationCoordinates: lat && lng ? { type: "Point", coordinates: [Number(lng), Number(lat)] } : undefined,
      });

      res.status(201).json({ success: true, property });
    } catch (err) {
      console.error("Error creating property:", err);
      res.status(500).json({ success: false, message: "Failed to create property" });
    }
  }
);

/**
 * @swagger
 * /api/properties/user:
 *   get:
 *     summary: Get properties by user
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by location
 *       - in: query
 *         name: priceMin
 *         schema:
 *           type: number
 *         description: Minimum price
 *       - in: query
 *         name: priceMax
 *         schema:
 *           type: number
 *         description: Maximum price
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [house, apartment, condo, land]
 *         description: Property type
 *       - in: query
 *         name: amenities
 *         schema:
 *           type: string
 *         description: Comma-separated amenities
 *       - in: query
 *         name: bedrooms
 *         schema:
 *           type: number
 *         description: Number of bedrooms
 *       - in: query
 *         name: bathrooms
 *         schema:
 *           type: number
 *         description: Number of bathrooms
 *       - in: query
 *         name: squareFootageMin
 *         schema:
 *           type: number
 *         description: Minimum square footage
 *       - in: query
 *         name: squareFootageMax
 *         schema:
 *           type: number
 *         description: Maximum square footage
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Full-text search query
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         description: Latitude for geospatial query
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *         description: Longitude for geospatial query
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *         description: Radius in kilometers for geospatial query
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, sold, pending, rented]
 *         description: Property status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of properties per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of user's properties
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *                 properties:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Property'
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Server error
 */
router.get("/user", protect, agent, async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const {
      location,
      priceMin,
      priceMax,
      type,
      amenities,
      bedrooms,
      bathrooms,
      squareFootageMin,
      squareFootageMax,
      search,
      lat,
      lng,
      radius,
      status,
      page = 1,
      limit = 10,
      sort = "createdAt",
      order = "desc",
    } = req.query;

    let query = { agent: req.user._id };

    // Sanitize inputs
    Object.keys(req.query).forEach((key) => {
      req.query[key] = sanitize(req.query[key]);
    });

    // Full-text search
    if (search) {
      query.$text = { $search: search };
    }

    // Geospatial query
    if (lat && lng && radius) {
      query.locationCoordinates = {
        $near: {
          $geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] },
          $maxDistance: Number(radius) * 1000, // Radius in meters
        },
      };
    }

    if (location) query.location = new RegExp(location, "i");
    if (type) query.type = type;
    if (amenities)
      query.amenities = { $all: amenities.toString().split(",").map((a) => a.trim()) };
    if (bedrooms) query.bedrooms = Number(bedrooms);
    if (bathrooms) query.bathrooms = Number(bathrooms);
    if (status) query.status = status;

    if (priceMin || priceMax) {
      query.price = {};
      if (priceMin) query.price.$gte = Number(priceMin);
      if (priceMax) query.price.$lte = Number(priceMax);
    }

    if (squareFootageMin || squareFootageMax) {
      query.squareFootage = {};
      if (squareFootageMin) query.squareFootage.$gte = Number(squareFootageMin);
      if (squareFootageMax) query.squareFootage.$lte = Number(squareFootageMax);
    }

    const total = await Property.countDocuments(query);
    const properties = await Property.find(query)
      .sort({ [sort]: order === "desc" ? -1 : 1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .populate("agent", "name email");

    res.json({
      success: true,
      count: properties.length,
      total,
      page: +page,
      pages: Math.ceil(total / +limit),
      properties,
    });
  } catch (err) {
    console.error("Error fetching user properties:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @swagger
 * /api/properties/analytics:
 *   get:
 *     summary: Get property analytics for agent
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Property analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 analytics:
 *                   type: object
 *                   properties:
 *                     totalListings:
 *                       type: integer
 *                     avgPrice:
 *                       type: number
 *                     totalViews:
 *                       type: integer
 *                     typeDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           count:
 *                             type: integer
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Server error
 */
router.get("/analytics", protect, agent, async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const properties = await Property.find({ agent: req.user._id });
    const totalListings = properties.length;
    const avgPrice = properties.length
      ? properties.reduce((sum, p) => sum + p.price, 0) / properties.length
      : 0;
    const totalViews = properties.reduce((sum, p) => sum + p.views, 0);
    const typeDistribution = ["house", "apartment", "condo", "land"].map((type) => ({
      name: type,
      count: properties.filter((p) => p.type === type).length,
    }));

    res.json({
      success: true,
      analytics: {
        totalListings,
        avgPrice,
        totalViews,
        typeDistribution,
      },
    });
  } catch (err) {
    console.error("Error fetching analytics:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @swagger
 * /api/properties/{id}:
 *   get:
 *     summary: Get a single property
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Property details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 property:
 *                   $ref: '#/components/schemas/Property'
 *       400:
 *         description: Invalid property ID
 *       404:
 *         description: Property not found
 *       500:
 *         description: Server error
 */
router.get("/:id", async (req, res) => {
  try {
    // Validate ObjectID
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid property ID" });
    }

    const property = await Property.findById(req.params.id).populate("agent", "name email");
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    // Increment views
    property.views += 1;
    await property.save();

    res.json({ success: true, property });
  } catch (err) {
    console.error("Error fetching property:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @swagger
 * /api/properties/{id}/status:
 *   patch:
 *     summary: Update a property's status
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, sold, pending, rented]
 *                 description: New status of the property
 *     responses:
 *       200:
 *         description: Property status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 property:
 *                   $ref: '#/components/schemas/Property'
 *       400:
 *         description: Invalid property ID or status
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Property not found
 *       500:
 *         description: Server error
 */
router.patch("/:id/status", protect, agent, async (req, res) => {
  try {
    // Validate ObjectID
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid property ID" });
    }

    const { status } = req.body;
    if (!["active", "sold", "pending", "rented"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    const isOwner =
      property.agent.toString() === req.user._id.toString() || req.user.role === "admin";
    if (!isOwner) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    property.status = status;
    await property.save();

    res.json({ success: true, property });
  } catch (err) {
    console.error("Error updating property status:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @swagger
 * /api/properties/{id}:
 *   put:
 *     summary: Update a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               location:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [house, apartment, condo, land]
 *               amenities:
 *                 type: array
 *                 items:
 *                   type: string
 *               bedrooms:
 *                 type: number
 *               bathrooms:
 *                 type: number
 *               squareFootage:
 *                 type: number
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Property updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 property:
 *                   $ref: '#/components/schemas/Property'
 *       400:
 *         description: Invalid property ID
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Property not found
 *       500:
 *         description: Server error
 */
router.put(
  "/:id",
  protect,
  agent,
  upload.array("images", 5),
  validateProperty,
  async (req, res) => {
    try {
      // Validate ObjectID
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid property ID" });
      }

      const property = await Property.findById(req.params.id);
      if (!property) {
        return res.status(404).json({ success: false, message: "Property not found" });
      }

      const isOwner =
        property.agent.toString() === req.user._id.toString() || req.user.role === "admin";
      if (!isOwner) {
        return res.status(403).json({ success: false, message: "Not authorized" });
      }

      // Update images only if new files are uploaded
      if (req.files && req.files.length > 0) {
        // Delete old images from Cloudinary
        for (const img of property.images) {
          await cloudinary.uploader.destroy(img.public_id);
        }

        // Set new images
        property.images = req.files.map((file) => ({
          url: file.path,
          public_id: file.filename,
        }));
      }

      // Update property fields
      property.title = req.body.title;
      property.description = req.body.description;
      property.price = Number(req.body.price);
      property.location = req.body.location;
      property.type = req.body.type;
      property.amenities = req.body.amenities || [];
      property.bedrooms = Number(req.body.bedrooms) || 0;
      property.bathrooms = Number(req.body.bathrooms) || 0;
      property.squareFootage = Number(req.body.squareFootage) || 0;
      if (req.body.lat && req.body.lng) {
        property.locationCoordinates = { type: "Point", coordinates: [Number(req.body.lng), Number(req.body.lat)] };
      }

      await property.save();
      res.json({ success: true, property });
    } catch (err) {
      console.error("Error updating property:", err);
      res.status(500).json({ success: false, message: "Server Error" });
    }
  }
);

/**
 * @swagger
 * /api/properties/{id}:
 *   delete:
 *     summary: Delete a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Property deleted
 *       400:
 *         description: Invalid property ID
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Property not found
 *       500:
 *         description: Server error
 */
router.delete("/:id", protect, agent, async (req, res) => {
  try {
    // Validate ObjectID
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid property ID" });
    }

    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    const isOwner =
      property.agent.toString() === req.user._id.toString() || req.user.role === "admin";
    if (!isOwner) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    

    // Delete images from Cloudinary
    for (const img of property.images) {
      await cloudinary.uploader.destroy(img.public_id);
    }

    await property.deleteOne();
    res.json({ success: true, message: "Property deleted" });
  } catch (err) {
    console.error("Error deleting property:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

module.exports = router;
