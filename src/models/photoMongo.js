import mongoose from 'mongoose';

const photoSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  filename: { type: String, required: true },
  filepath: { type: String, required: true, unique: true, index: true },
  directory: { type: String, required: true, index: true },
  file_size: { type: Number, required: true },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  mime_type: { type: String, default: null },
  format: { type: String, default: null, index: true },
  date_taken: { type: Date, default: null, index: true },
  date_modified: { type: Date, required: true, index: true },
  camera_make: { type: String, default: null },
  camera_model: { type: String, default: null },
  thumbnail_path: { type: String, default: null },
  is_deleted: { type: Boolean, default: false, index: true }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Composite indexes for ultra-fast sorting and pagination
photoSchema.index({ is_deleted: 1, date_taken: -1, date_modified: -1 });
photoSchema.index({ is_deleted: 1, filename: 1 });
photoSchema.index({ is_deleted: 1, directory: 1 });
photoSchema.index({ is_deleted: 1, format: 1 });

export const MongoPhoto = mongoose.models.Photo || mongoose.model('Photo', photoSchema);
