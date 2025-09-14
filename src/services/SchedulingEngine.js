import dayjs from "dayjs";
import { FixedSchedule } from "../models/FixedSchedule.js";
import { LearningGoal } from "../models/LearningGoal.js";
import { GeneratedSchedule } from "../models/GeneratedSchedule.js";

/**
 * Core Scheduling Engine for SmartStudy
 * Automatically allocates learning time based on fixed schedule and learning goals
 */
export class SchedulingEngine {
  /**
   * Generate schedule for a specific date
   * @param {string} userId - User ID
   * @param {Date} targetDate - Date to generate schedule for
   * @returns {Array} Generated schedule items
   */
  static async generateDailySchedule(userId, targetDate = new Date()) {
    const date = dayjs(targetDate);
    const dayOfWeek = date.day(); // 0 = Sunday, 1 = Monday, etc.

    // 1. Get user's fixed schedule for this day
    const fixedSchedule = await FixedSchedule.getScheduleForDays(userId, [
      dayOfWeek,
    ]);

    // 2. Get user's active learning goals
    const learningGoals = await LearningGoal.getActiveGoalsByPriority(userId);

    // 3. Find free time slots
    const freeSlots = this.findFreeTimeSlots(fixedSchedule, date);

    // 4. Allocate learning goals to free slots
    const generatedSchedule = this.allocateLearningTime(
      learningGoals,
      freeSlots,
      date
    );

    // 5. Save generated schedule to database
    await this.saveGeneratedSchedule(userId, generatedSchedule, targetDate);

    return generatedSchedule;
  }

  /**
   * Find free time slots in a day
   * @param {Array} fixedSchedule - User's fixed schedule
   * @param {dayjs.Dayjs} date - Target date
   * @returns {Array} Free time slots
   */
  static findFreeTimeSlots(fixedSchedule, date) {
    // Define available hours (6 AM to 11 PM)
    const dayStart = 6 * 60; // 6:00 AM in minutes
    const dayEnd = 23 * 60; // 11:00 PM in minutes

    // Convert fixed schedule to time blocks
    const busyBlocks = fixedSchedule.map((item) => ({
      start: item.startTime,
      end: item.endTime,
      title: item.title,
    }));

    // Add buffer time (meals, commute, etc.)
    const bufferedBlocks = this.addBufferTime(busyBlocks);

    // Sort busy blocks by start time
    bufferedBlocks.sort((a, b) => a.start - b.start);

    // Find gaps between busy blocks
    const freeSlots = [];
    let currentTime = dayStart;

    for (const block of bufferedBlocks) {
      // If there's a gap before this block
      if (currentTime < block.start) {
        const gapDuration = block.start - currentTime;
        if (gapDuration >= 30) {
          // Only consider gaps >= 30 minutes
          freeSlots.push({
            start: currentTime,
            end: block.start,
            duration: gapDuration,
            startTime: date.startOf("day").add(currentTime, "minute").toDate(),
            endTime: date.startOf("day").add(block.start, "minute").toDate(),
          });
        }
      }
      currentTime = Math.max(currentTime, block.end);
    }

    // Add final slot if there's time left in the day
    if (currentTime < dayEnd) {
      const finalDuration = dayEnd - currentTime;
      if (finalDuration >= 30) {
        freeSlots.push({
          start: currentTime,
          end: dayEnd,
          duration: finalDuration,
          startTime: date.startOf("day").add(currentTime, "minute").toDate(),
          endTime: date.startOf("day").add(dayEnd, "minute").toDate(),
        });
      }
    }

    return freeSlots;
  }

  /**
   * Add buffer time around fixed schedule items
   * @param {Array} busyBlocks - Fixed schedule blocks
   * @returns {Array} Blocks with buffer time added
   */
  static addBufferTime(busyBlocks) {
    return busyBlocks.map((block) => ({
      ...block,
      start: Math.max(0, block.start - 15), // 15 min buffer before
      end: Math.min(1439, block.end + 15), // 15 min buffer after
    }));
  }

  /**
   * Allocate learning goals to free time slots
   * @param {Array} learningGoals - User's learning goals
   * @param {Array} freeSlots - Available time slots
   * @param {dayjs.Dayjs} date - Target date
   * @returns {Array} Generated schedule items
   */
  static allocateLearningTime(learningGoals, freeSlots, date) {
    const generatedSchedule = [];
    const availableSlots = [...freeSlots]; // Copy to avoid mutation

    // Process each learning goal by priority
    for (const goal of learningGoals) {
      const targetMinutes = goal.targetHoursPerDay * 60;
      let remainingMinutes = targetMinutes;

      // Try to allocate time for this goal
      while (remainingMinutes > 0 && availableSlots.length > 0) {
        // Find best slot for this goal
        const bestSlot = this.findBestSlotForGoal(
          goal,
          availableSlots,
          remainingMinutes
        );

        if (!bestSlot) break; // No suitable slot found

        // Calculate session duration
        const sessionDuration = this.calculateOptimalSessionDuration(
          goal,
          bestSlot.duration,
          remainingMinutes
        );

        // Create schedule item
        const scheduleItem = {
          learningGoalId: goal._id,
          subject: goal.subject,
          startTime: bestSlot.startTime,
          endTime: new Date(
            bestSlot.startTime.getTime() + sessionDuration * 60 * 1000
          ),
          duration: sessionDuration,
          priority: goal.priority,
          category: goal.category,
          color: goal.color,
          icon: goal.icon,
        };

        generatedSchedule.push(scheduleItem);

        // Update remaining time
        remainingMinutes -= sessionDuration;

        // Update or remove the slot
        this.updateAvailableSlot(availableSlots, bestSlot, sessionDuration);
      }
    }

    return generatedSchedule.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Find the best time slot for a learning goal
   * @param {Object} goal - Learning goal
   * @param {Array} availableSlots - Available time slots
   * @param {number} remainingMinutes - Remaining time to allocate
   * @returns {Object} Best slot or null
   */
  static findBestSlotForGoal(goal, availableSlots, remainingMinutes) {
    // Filter slots that can accommodate minimum session length
    const suitableSlots = availableSlots.filter(
      (slot) => slot.duration >= goal.sessionLength.min
    );

    if (suitableSlots.length === 0) return null;

    // Score slots based on preferences
    const scoredSlots = suitableSlots.map((slot) => ({
      ...slot,
      score: this.scoreSlotForGoal(goal, slot),
    }));

    // Return slot with highest score
    return scoredSlots.reduce((best, current) =>
      current.score > best.score ? current : best
    );
  }

  /**
   * Score a time slot for a learning goal
   * @param {Object} goal - Learning goal
   * @param {Object} slot - Time slot
   * @returns {number} Score (higher is better)
   */
  static scoreSlotForGoal(goal, slot) {
    let score = 0;

    // Base score from slot duration
    score +=
      (Math.min(slot.duration, goal.sessionLength.preferred) /
        goal.sessionLength.preferred) *
      100;

    // Bonus for preferred time slots
    const hour = dayjs(slot.startTime).hour();
    const timeSlot = this.getTimeSlotCategory(hour);

    if (goal.preferredTimeSlots.includes(timeSlot)) {
      score += 50; // Bonus for preferred time
    }

    // Priority bonus
    const priorityBonus = { high: 30, medium: 20, low: 10 };
    score += priorityBonus[goal.priority] || 0;

    return score;
  }

  /**
   * Get time slot category from hour
   * @param {number} hour - Hour (0-23)
   * @returns {string} Time slot category
   */
  static getTimeSlotCategory(hour) {
    if (hour >= 5 && hour < 8) return "early-morning";
    if (hour >= 8 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }

  /**
   * Calculate optimal session duration
   * @param {Object} goal - Learning goal
   * @param {number} slotDuration - Available slot duration
   * @param {number} remainingMinutes - Remaining time to allocate
   * @returns {number} Optimal session duration in minutes
   */
  static calculateOptimalSessionDuration(goal, slotDuration, remainingMinutes) {
    const { min, max, preferred } = goal.sessionLength;

    // Start with preferred duration
    let duration = preferred;

    // Don't exceed remaining time needed
    duration = Math.min(duration, remainingMinutes);

    // Don't exceed available slot time
    duration = Math.min(duration, slotDuration);

    // Ensure minimum duration
    duration = Math.max(duration, min);

    // Don't exceed maximum duration
    duration = Math.min(duration, max);

    return duration;
  }

  /**
   * Update available slot after allocation
   * @param {Array} availableSlots - Available slots array
   * @param {Object} usedSlot - Slot that was used
   * @param {number} usedDuration - Duration that was used
   */
  static updateAvailableSlot(availableSlots, usedSlot, usedDuration) {
    const index = availableSlots.indexOf(usedSlot);
    if (index === -1) return;

    const remainingDuration = usedSlot.duration - usedDuration;

    if (remainingDuration >= 30) {
      // Keep slot if >= 30 minutes remaining
      usedSlot.duration = remainingDuration;
      usedSlot.start += usedDuration;
      usedSlot.startTime = new Date(
        usedSlot.startTime.getTime() + usedDuration * 60 * 1000
      );
    } else {
      // Remove slot if too small
      availableSlots.splice(index, 1);
    }
  }

  /**
   * Save generated schedule to database
   * @param {string} userId - User ID
   * @param {Array} scheduleItems - Generated schedule items
   * @param {Date} targetDate - Target date
   */
  static async saveGeneratedSchedule(userId, scheduleItems, targetDate) {
    // Remove existing generated schedule for this date
    await GeneratedSchedule.deleteMany({
      userId,
      date: {
        $gte: dayjs(targetDate).startOf("day").toDate(),
        $lte: dayjs(targetDate).endOf("day").toDate(),
      },
    });

    // Create new schedule items
    const scheduleDocuments = scheduleItems.map((item) => ({
      userId,
      date: dayjs(targetDate).startOf("day").toDate(),
      learningGoalId: item.learningGoalId,
      startTime: item.startTime,
      endTime: item.endTime,
      duration: item.duration,
      status: "scheduled",
    }));

    if (scheduleDocuments.length > 0) {
      await GeneratedSchedule.insertMany(scheduleDocuments);
    }
  }

  /**
   * Generate schedule for multiple days
   * @param {string} userId - User ID
   * @param {Date} startDate - Start date
   * @param {number} days - Number of days to generate
   * @returns {Object} Generated schedules by date
   */
  static async generateWeeklySchedule(
    userId,
    startDate = new Date(),
    days = 7
  ) {
    const schedules = {};

    for (let i = 0; i < days; i++) {
      const targetDate = dayjs(startDate).add(i, "day").toDate();
      const dailySchedule = await this.generateDailySchedule(
        userId,
        targetDate
      );
      schedules[dayjs(targetDate).format("YYYY-MM-DD")] = dailySchedule;
    }

    return schedules;
  }
}
