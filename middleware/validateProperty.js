const { body, validationResult } = require("express-validator");

exports.validateProperty = [
  body("title").notEmpty().withMessage("Title is required"),
  body("description").notEmpty().withMessage("Description is required"),
  body("price").isNumeric().withMessage("Price must be a number"),
  body("location").notEmpty().withMessage("Location is required"),
  body("type").isIn(["house", "apartment", "condo", "land"]).withMessage("Invalid property type"),
  body("bedrooms").optional().isInt({ min: 0 }).withMessage("Bedrooms must be a non-negative integer"),
  body("bathrooms").optional().isInt({ min: 0 }).withMessage("Bathrooms must be a non-negative integer"),
  body("squareFootage").optional().isInt({ min: 0 }).withMessage("Square footage must be a non-negative integer"),
  body("lat").optional().isFloat({ min: -90, max: 90 }).withMessage("Latitude must be between -90 and 90"),
  body("lng").optional().isFloat({ min: -180, max: 180 }).withMessage("Longitude must be between -180 and 180"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    next();
  },
];