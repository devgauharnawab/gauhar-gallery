import mongoose from 'mongoose';

const albumSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  coverPhotoId: { type: String, default: null },
  photos: [{ type: String, ref: 'Photo' }]
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

export const MongoAlbum = mongoose.models.Album || mongoose.model('Album', albumSchema);
