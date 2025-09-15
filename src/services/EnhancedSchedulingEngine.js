import dayjs from "dayjs";
import { FixedSchedule } from "../models/FixedSchedule.js";
import { LearningGoal } from "../models/LearningGoal.js";
import { GeneratedSchedule } from "../models/GeneratedSchedule.js";

/**
 * Enhanced Scheduling Engine with intelligent buffer time and content analysis
 */
export class EnhancedSchedulingEngine {
  
  // Buffer time configurations based on activity types
  static BUFFER_CONFIG = {
    // Meal times (longer buffer for preparation and eating)
    meal: { before: 30, after: 45 },
    // Work/Study (medium buffer for context switching)
    work: { before: 15, after: 15 },
    study: { before: 15, after: 15 },
    // Personal activities (shorter buffer)
    personal: { before: 10, after: 10 },
    // Default buffer
    default: { before: 15, after: 15 },
  };

  // Learning content templates with suggested breakdown
  static LEARNING_TEMPLATES = {
    // Programming languages
    "javascript": {
      sessions: [
        { topic: "Syntax & Basics", duration: 45, order: 1 },
        { topic: "Functions & Objects", duration: 60, order: 2 },
        { topic: "DOM Manipulation", duration: 50, order: 3 },
        { topic: "Async Programming", duration: 70, order: 4 },
        { topic: "Practice Projects", duration: 90, order: 5 },
      ]
    },
    "react": {
      sessions: [
        { topic: "Components & JSX", duration: 45, order: 1 },
        { topic: "State & Props", duration: 60, order: 2 },
        { topic: "Hooks", duration: 75, order: 3 },
        { topic: "Routing", duration: 45, order: 4 },
        { topic: "State Management", duration: 90, order: 5 },
      ]
    },
    "python": {
      sessions: [
        { topic: "Syntax & Data Types", duration: 45, order: 1 },
        { topic: "Control Flow", duration: 50, order: 2 },
        { topic: "Functions & Modules", duration: 60, order: 3 },
        { topic: "OOP Concepts", duration: 75, order: 4 },
        { topic: "Libraries & Projects", duration: 90, order: 5 },
      ]
    },
    
    // Languages
    "english": {
      sessions: [
        { topic: "Vocabulary Building", duration: 30, order: 1 },
        { topic: "Grammar Practice", duration: 45, order: 2 },
        { topic: "Listening Skills", duration: 40, order: 3 },
        { topic: "Speaking Practice", duration: 50, order: 4 },
        { topic: "Writing Exercise", duration: 60, order: 5 },
      ]
    },
    "ielts": {
      sessions: [
        { topic: "Reading Strategies", duration: 60, order: 1 },
        { topic: "Listening Practice", duration: 45, order: 2 },
        { topic: "Writing Task 1", duration: 50, order: 3 },
        { topic: "Writing Task 2", duration: 70, order: 4 },
        { topic: "Speaking Mock Test", duration: 40, order: 5 },
      ]
    },
    
    // Default template
    "default": {
      sessions: [
        { topic: "Foundation", duration: 45, order: 1 },
        { topic: "Core Concepts", duration: 60, order: 2 },
        { topic: "Practice", duration: 50, order: 3 },
        { topic: "Advanced Topics", duration: 75, order: 4 },
        { topic: "Application", duration: 90, order: 5 },
      ]
    }
  };

  /**
   * Generate intelligent schedule with content breakdown
   */
  static async generateDailySchedule(userId, targetDate = new Date()) {
    const date = dayjs(targetDate);
    const dayOfWeek = date.day();
    
    // 1. Get user's fixed schedule
    const fixedSchedule = await FixedSchedule.getScheduleForDays(userId, [dayOfWeek]);
    
    // 2. Get learning goals
    const learningGoals = await LearningGoal.getActiveGoalsByPriority(userId);
    
    // 3. Find free slots with intelligent buffer
    const freeSlots = this.findIntelligentFreeSlots(fixedSchedule, date);
    
    // 4. Allocate learning time with content breakdown
    const generatedSchedule = this.allocateIntelligentLearningTime(learningGoals, freeSlots, date);
    
    // 5. Save to database
    await this.saveGeneratedSchedule(userId, generatedSchedule, targetDate);
    
    return generatedSchedule;
  }

  /**
   * Find free slots with intelligent buffer time based on activity types
   */
  static findIntelligentFreeSlots(fixedSchedule, date) {
    const dayStart = 6 * 60; // 6:00 AM
    const dayEnd = 23 * 60;  // 11:00 PM
    
    // Categorize activities and add appropriate buffers
    const bufferedBlocks = fixedSchedule.map(item => {
      const bufferConfig = this.getBufferForActivity(item);
      return {
        ...item,
        start: Math.max(0, item.startTime - bufferConfig.before),
        end: Math.min(1439, item.endTime + bufferConfig.after),
        originalStart: item.startTime,
        originalEnd: item.endTime,
        title: item.title,
        type: item.type || 'default'
      };
    });

    // Add automatic meal breaks if not present
    const mealsAdded = this.addMealBreaks(bufferedBlocks, date);
    
    // Sort by start time
    mealsAdded.sort((a, b) => a.start - b.start);
    
    // Find gaps
    const freeSlots = [];
    let currentTime = dayStart;
    
    for (const block of mealsAdded) {
      if (currentTime < block.start) {
        const gapDuration = block.start - currentTime;
        if (gapDuration >= 30) { // Only gaps >= 30 minutes
          freeSlots.push({
            start: currentTime,
            end: block.start,
            duration: gapDuration,
            startTime: date.startOf('day').add(currentTime, 'minute').toDate(),
            endTime: date.startOf('day').add(block.start, 'minute').toDate(),
            // Context about surrounding activities
            beforeActivity: block.title,
            afterActivity: this.findPreviousActivity(mealsAdded, block)
          });
        }
      }
      currentTime = Math.max(currentTime, block.end);
    }
    
    // Final slot
    if (currentTime < dayEnd) {
      const finalDuration = dayEnd - currentTime;
      if (finalDuration >= 30) {
        freeSlots.push({
          start: currentTime,
          end: dayEnd,
          duration: finalDuration,
          startTime: date.startOf('day').add(currentTime, 'minute').toDate(),
          endTime: date.startOf('day').add(dayEnd, 'minute').toDate(),
          beforeActivity: 'End of day'
        });
      }
    }
    
    return freeSlots;
  }

  /**
   * Get appropriate buffer time based on activity type
   */
  static getBufferForActivity(activity) {
    const title = activity.title.toLowerCase();
    const type = activity.type || 'default';
    
    // Check for meal-related keywords
    if (title.includes('ăn') || title.includes('meal') || title.includes('lunch') || 
        title.includes('dinner') || title.includes('breakfast') || title.includes('cơm')) {
      return this.BUFFER_CONFIG.meal;
    }
    
    // Check for work/study keywords
    if (title.includes('work') || title.includes('làm việc') || title.includes('học') || 
        title.includes('study') || type === 'work' || type === 'class') {
      return this.BUFFER_CONFIG.work;
    }
    
    return this.BUFFER_CONFIG.default;
  }

  /**
   * Add automatic meal breaks if not present
   */
  static addMealBreaks(blocks, date) {
    const result = [...blocks];
    const mealTimes = [
      { name: 'Bữa sáng', start: 7 * 60, end: 8 * 60 }, // 7:00-8:00
      { name: 'Bữa trưa', start: 12 * 60, end: 13 * 60 }, // 12:00-13:00
      { name: 'Bữa tối', start: 18 * 60, end: 19 * 60 }, // 18:00-19:00
    ];
    
    for (const meal of mealTimes) {
      // Check if there's already an activity during meal time
      const hasConflict = blocks.some(block => 
        (block.originalStart < meal.end && block.originalEnd > meal.start)
      );
      
      if (!hasConflict) {
        result.push({
          title: meal.name,
          type: 'meal',
          start: meal.start - 15, // 15 min buffer before
          end: meal.end + 15,     // 15 min buffer after
          originalStart: meal.start,
          originalEnd: meal.end,
          isAutoGenerated: true
        });
      }
    }
    
    return result;
  }

  /**
   * Allocate learning time with content breakdown
   */
  static allocateIntelligentLearningTime(learningGoals, freeSlots, date) {
    const generatedSchedule = [];
    const availableSlots = [...freeSlots];
    
    for (const goal of learningGoals) {
      const targetMinutes = goal.targetHoursPerDay * 60;
      let remainingMinutes = targetMinutes;
      
      // Get content template for this subject
      const template = this.getContentTemplate(goal.subject);
      let sessionIndex = 0;
      
      while (remainingMinutes > 0 && availableSlots.length > 0 && sessionIndex < template.sessions.length) {
        const bestSlot = this.findBestSlotForGoal(goal, availableSlots, remainingMinutes);
        if (!bestSlot) break;
        
        const currentSession = template.sessions[sessionIndex];
        const sessionDuration = Math.min(
          currentSession.duration,
          remainingMinutes,
          bestSlot.duration,
          goal.sessionLength.max
        );
        
        if (sessionDuration >= goal.sessionLength.min) {
          const scheduleItem = {
            learningGoalId: goal._id,
            subject: goal.subject,
            sessionTopic: currentSession.topic,
            sessionOrder: currentSession.order,
            startTime: bestSlot.startTime,
            endTime: new Date(bestSlot.startTime.getTime() + sessionDuration * 60 * 1000),
            duration: sessionDuration,
            priority: goal.priority,
            category: goal.category,
            color: goal.color,
            icon: goal.icon,
            // Add context for better scheduling
            contextBefore: bestSlot.afterActivity,
            contextAfter: bestSlot.beforeActivity,
            suggestedBreak: this.getSuggestedBreak(sessionDuration)
          };
          
          generatedSchedule.push(scheduleItem);
          remainingMinutes -= sessionDuration;
          sessionIndex++;
          
          // Update available slot
          this.updateAvailableSlot(availableSlots, bestSlot, sessionDuration);
        } else {
          break;
        }
      }
    }
    
    return generatedSchedule.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Get content template based on subject
   */
  static getContentTemplate(subject) {
    const normalizedSubject = subject.toLowerCase().replace(/\s+/g, '');
    
    // Check for exact matches first
    if (this.LEARNING_TEMPLATES[normalizedSubject]) {
      return this.LEARNING_TEMPLATES[normalizedSubject];
    }
    
    // Check for partial matches
    for (const [key, template] of Object.entries(this.LEARNING_TEMPLATES)) {
      if (normalizedSubject.includes(key) || key.includes(normalizedSubject)) {
        return template;
      }
    }
    
    return this.LEARNING_TEMPLATES.default;
  }

  /**
   * Find best slot with context awareness
   */
  static findBestSlotForGoal(goal, availableSlots, remainingMinutes) {
    const suitableSlots = availableSlots.filter(slot => 
      slot.duration >= goal.sessionLength.min
    );
    
    if (suitableSlots.length === 0) return null;
    
    const scoredSlots = suitableSlots.map(slot => ({
      ...slot,
      score: this.scoreSlotForGoalWithContext(goal, slot)
    }));
    
    return scoredSlots.reduce((best, current) => 
      current.score > best.score ? current : best
    );
  }

  /**
   * Score slot with context awareness
   */
  static scoreSlotForGoalWithContext(goal, slot) {
    let score = 0;
    
    // Base score from duration
    score += Math.min(slot.duration, goal.sessionLength.preferred) / goal.sessionLength.preferred * 100;
    
    // Time preference bonus
    const hour = dayjs(slot.startTime).hour();
    const timeSlot = this.getTimeSlotCategory(hour);
    if (goal.preferredTimeSlots.includes(timeSlot)) {
      score += 50;
    }
    
    // Priority bonus
    const priorityBonus = { high: 30, medium: 20, low: 10 };
    score += priorityBonus[goal.priority] || 0;
    
    // Context bonus - prefer slots after meals/breaks
    if (slot.afterActivity && slot.afterActivity.includes('meal')) {
      score += 20; // Learning after meals is good
    }
    
    // Avoid slots right before meals
    if (slot.beforeActivity && slot.beforeActivity.includes('meal')) {
      score -= 10;
    }
    
    return score;
  }

  /**
   * Get suggested break duration
   */
  static getSuggestedBreak(sessionDuration) {
    if (sessionDuration >= 90) return 15; // 15 min break for long sessions
    if (sessionDuration >= 60) return 10; // 10 min break for medium sessions
    return 5; // 5 min break for short sessions
  }

  /**
   * Get time slot category
   */
  static getTimeSlotCategory(hour) {
    if (hour >= 5 && hour < 8) return "early-morning";
    if (hour >= 8 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }

  /**
   * Find previous activity for context
   */
  static findPreviousActivity(blocks, currentBlock) {
    const previousBlocks = blocks.filter(b => b.end <= currentBlock.start);
    if (previousBlocks.length === 0) return null;
    
    const closest = previousBlocks.reduce((prev, current) => 
      current.end > prev.end ? current : prev
    );
    
    return closest.title;
  }

  /**
   * Update available slot after allocation
   */
  static updateAvailableSlot(availableSlots, usedSlot, usedDuration) {
    const index = availableSlots.indexOf(usedSlot);
    if (index === -1) return;
    
    const remainingDuration = usedSlot.duration - usedDuration;
    
    if (remainingDuration >= 30) {
      usedSlot.duration = remainingDuration;
      usedSlot.start += usedDuration;
      usedSlot.startTime = new Date(usedSlot.startTime.getTime() + usedDuration * 60 * 1000);
    } else {
      availableSlots.splice(index, 1);
    }
  }

  /**
   * Save generated schedule (reuse from original)
   */
  static async saveGeneratedSchedule(userId, scheduleItems, targetDate) {
    await GeneratedSchedule.deleteMany({
      userId,
      date: {
        $gte: dayjs(targetDate).startOf('day').toDate(),
        $lte: dayjs(targetDate).endOf('day').toDate()
      }
    });
    
    const scheduleDocuments = scheduleItems.map(item => ({
      userId,
      date: dayjs(targetDate).startOf('day').toDate(),
      learningGoalId: item.learningGoalId,
      startTime: item.startTime,
      endTime: item.endTime,
      duration: item.duration,
      status: 'scheduled',
      // Enhanced fields
      sessionTopic: item.sessionTopic,
      sessionOrder: item.sessionOrder,
      contextBefore: item.contextBefore,
      contextAfter: item.contextAfter,
      suggestedBreak: item.suggestedBreak
    }));
    
    if (scheduleDocuments.length > 0) {
      await GeneratedSchedule.insertMany(scheduleDocuments);
    }
  }

  /**
   * Generate weekly schedule
   */
  static async generateWeeklySchedule(userId, startDate = new Date(), days = 7) {
    const schedules = {};
    
    for (let i = 0; i < days; i++) {
      const targetDate = dayjs(startDate).add(i, 'day').toDate();
      const dailySchedule = await this.generateDailySchedule(userId, targetDate);
      schedules[dayjs(targetDate).format('YYYY-MM-DD')] = dailySchedule;
    }
    
    return schedules;
  }
}






