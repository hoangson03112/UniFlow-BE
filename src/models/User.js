import mongoose from "mongoose";
const { Schema, model } = mongoose;

const UserSchema = new Schema(
  {
    // Firebase UID (unique identifier từ Firebase)
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Thông tin từ Google
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    avatar: {
      type: String,
      trim: true,
    },

    // Thông tin bổ sung
    isActive: {
      type: Boolean,
      default: true,
    },

    // Tracking
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },

    loginCount: {
      type: Number,
      default: 1,
    },

    // Settings (có thể mở rộng sau)
    settings: {
      timezone: {
        type: String,
        default: "Asia/Ho_Chi_Minh",
      },
      language: {
        type: String,
        default: "vi",
      },
      theme: {
        type: String,
        enum: ["light", "dark", "auto"],
        default: "light",
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ firebaseUid: 1 }, { unique: true });
UserSchema.index({ createdAt: -1 });

// Static method: Tạo hoặc update user từ Firebase
UserSchema.statics.createOrUpdateFromFirebase = async function (firebaseUser) {
  const { uid, email, displayName, photoURL } = firebaseUser;

  try {
    console.log(`🔍 Looking for user with firebaseUid: ${uid}`);
    
    // Tìm user theo Firebase UID
    let user = await this.findOne({ firebaseUid: uid });

    if (user) {
      // Update thông tin nếu đã tồn tại
      user.name = displayName || user.name;
      user.email = email || user.email;
      user.avatar = photoURL || user.avatar;
      user.lastLoginAt = new Date();
      user.loginCount += 1;

      await user.save();
      console.log(`✅ Updated user: ${email} (ID: ${user._id})`);
    } else {
      // Tạo user mới
      console.log(`🆕 Creating new user for: ${email}`);
      user = await this.create({
        firebaseUid: uid,
        email: email,
        name: displayName || "Google User",
        avatar: photoURL || "",
        lastLoginAt: new Date(),
        loginCount: 1,
      });
      console.log(`🆕 Created new user: ${email} (ID: ${user._id})`);
    }

    return user;
  } catch (error) {
    console.error("❌ Error in createOrUpdateFromFirebase:", error);
    throw error;
  }
};

// Static method: Lấy user theo Firebase UID
UserSchema.statics.findByFirebaseUid = async function (firebaseUid) {
  return this.findOne({ firebaseUid, isActive: true }).lean();
};

// Method: Update last login
UserSchema.methods.updateLastLogin = function () {
  this.lastLoginAt = new Date();
  this.loginCount += 1;
  return this.save();
};

// Method: Get user stats
UserSchema.methods.getStats = async function () {
  const Task = mongoose.model("Task");

  const taskCount = await Task.countDocuments({
    userId: this._id.toString(),
    isActive: true,
  });

  const totalTasks = await Task.countDocuments({
    userId: this._id.toString(),
  });

  return {
    userId: this._id,
    taskCount,
    totalTasks,
    joinedAt: this.createdAt,
    lastLogin: this.lastLoginAt,
    loginCount: this.loginCount,
  };
};

export const User = model("User", UserSchema);






