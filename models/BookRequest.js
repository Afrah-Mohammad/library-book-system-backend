const mongoose = require('mongoose');

const bookRequestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    author: { type: String, required: true },
    isbn: { type: String },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'completed'],
      default: 'pending'
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    notes: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('BookRequest', bookRequestSchema);
