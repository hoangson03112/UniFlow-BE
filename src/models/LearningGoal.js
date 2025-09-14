import mongoose from "mongoose";
const { Schema, model } = mongoose;

const LearningGoalSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    targetHoursPerDay: {
      type: Number,
      required: true,
      min: 0.25,
      max: 8,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Simple validation
LearningGoalSchema.pre("validate", function (next) {
  // Chỉ validate targetHoursPerDay
  if (this.targetHoursPerDay && (this.targetHoursPerDay < 0.25 || this.targetHoursPerDay > 8)) {
    return next(new Error("targetHoursPerDay must be between 0.25 and 8 hours"));
  }
  next();
});

// Indexes
LearningGoalSchema.index({ userId: 1 });

// Static method to get goals by user
LearningGoalSchema.statics.getUserGoals = async function (userId) {
  return await this.find({ userId }).sort({ createdAt: -1 }).lean();
};

// Method to track basic progress
LearningGoalSchema.methods.updateProgress = function (hoursStudied) {
  // Simple progress tracking - có thể mở rộng sau
  return this.save();
};

export const LearningGoal = model("LearningGoal", LearningGoalSchema);
