import { Task } from "../models/Task.js";

/**
 * Auto Task Generator - Tự động tạo task từ Learning Goals với AI-powered scheduling
 */
export class AutoTaskGenerator {
  // Cấu hình đơn giản cho việc sắp xếp thời gian học
  static STUDY_CONFIG = {
    defaultSessionLength: 45, // phiên ngắn để tăng số lượng và linh hoạt
    breakDuration: 10, // 10 phút nghỉ
    maxSessionsPerDay: 6, // tăng số phiên tối đa trong ngày
    minSessionsPerDay: 1,
    minSessionLength: 30, // Tối thiểu 30 phút (giữ chất lượng)
    maxSessionLength: 90, // Tối đa 90 phút/phiên để giữ tập trung
    maxContinuousTime: 120, // Tối đa 2 giờ liên tục trước khi nghỉ dài
    prepBufferMin: 5, // phút chuẩn bị trước buổi học
    wrapBufferMin: 5, // phút kết thúc/ghi chú sau buổi học
    macroBreakMin: 20, // nghỉ dài sau một cụm sessions
    macroBreakAfterSessions: 2, // sau 2 session liên tiếp thì nghỉ dài
    protectedWindows: [
      { start: 12 * 60, end: 13 * 60 }, // trưa 12:00-13:00
      { start: 18 * 60, end: 19 * 60 }, // tối 18:00-19:00
    ],
  };

  /**
   * Tự động tạo tasks từ learning goal
   */
  static async generateTasksFromLearningGoal(userId, learningGoal) {
    // 1. Lấy tất cả tasks hiện có của user
    const existingTasks = await Task.find({ userId, isActive: true });

    // 2. Lấy ngày hiện tại và tính toán các ngày trong tuần còn lại
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 = CN, 1 = T2, ..., 6 = T7

    // 3. Tìm khung thời gian trống cho từng ngày trong tuần (chỉ từ hôm nay trở đi)
    const generatedTasks = [];

    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
      // Chỉ tạo tasks cho ngày hiện tại và các ngày trong tương lai
      if (dayOfWeek < currentDayOfWeek) {
        continue; // Bỏ qua các ngày trong quá khứ
      }

      // CN (0) đến T7 (6)
      const dayTasks = existingTasks.filter((task) =>
        task.weekdays.includes(dayOfWeek)
      );
      const freeSlots = this.findFreeSlots(dayTasks, dayOfWeek);

      // Ước lượng số phiên phù hợp theo năng lực rảnh của ngày + mục tiêu
      const cfg = this.STUDY_CONFIG;
      const totalFree = freeSlots.reduce((s, x) => s + x.duration, 0);

      const targetMinutes = Math.round(
        (learningGoal.targetHoursPerDay || 0) * 60
      );
      // ước lượng mỗi phiên cần ~ (prep+study+wrap+avg break) ~ 5+45+5+10 = 65m
      const approxBlock =
        cfg.prepBufferMin +
        cfg.defaultSessionLength +
        cfg.wrapBufferMin +
        cfg.breakDuration;
      const capacitySessions = Math.max(
        1,
        Math.floor(totalFree / Math.max(50, approxBlock))
      );

      // Chọn số phiên hợp lý dựa trên mục tiêu và năng lực rảnh
      let baseCount = Math.max(
        cfg.minSessionsPerDay,
        Math.ceil(targetMinutes / cfg.defaultSessionLength)
      );
      let plannedCount = Math.min(
        cfg.maxSessionsPerDay,
        Math.min(baseCount, capacitySessions)
      );

      // Với mục tiêu rất nhỏ, gom vào 1 phiên (>=15p)
      if (targetMinutes > 0 && targetMinutes <= 30) {
        plannedCount = 1;
      }

      const sessions = this.buildBalancedSessions(
        targetMinutes,
        plannedCount,
        cfg
      );

      // 5. Phân bổ sessions vào các slot trống hợp lý
      const dayGeneratedTasks = this.allocateSimpleSessions(
        sessions,
        freeSlots,
        learningGoal,
        dayOfWeek,
        userId
      );

      generatedTasks.push(...dayGeneratedTasks);
    }

    // 6. Lưu các task mới vào database
    if (generatedTasks.length > 0) {
      await Task.insertMany(generatedTasks);
    }

    return generatedTasks;
  }

  /**
   * Tính toán sessions đơn giản dựa trên thời gian user muốn học
   */
  static calculateSimpleSessions(targetHoursPerDay) {
    const targetMinutes = targetHoursPerDay * 60;
    const sessions = [];

    let remainingMinutes = targetMinutes;
    let sessionOrder = 1;

    while (remainingMinutes > 0) {
      // Tính session length hợp lý
      const sessionLength = Math.min(
        this.STUDY_CONFIG.defaultSessionLength,
        remainingMinutes
      );

      if (sessionLength >= this.STUDY_CONFIG.minSessionLength) {
        sessions.push({
          duration: sessionLength,
          order: sessionOrder++,
          needsBreak: remainingMinutes > sessionLength, // Cần nghỉ nếu còn session sau
          breakDuration: this.STUDY_CONFIG.breakDuration,
        });

        remainingMinutes -= sessionLength;
      } else {
        break;
      }
    }

    return sessions;
  }

  /**
   * Tạo danh sách sessions theo số lượng và độ dài mặc định
   */
  static buildSessions(count, defaultLen, minLen) {
    const sessions = [];
    for (let i = 0; i < count; i++) {
      sessions.push({
        duration: defaultLen,
        order: i + 1,
        needsBreak: i < count - 1,
        breakDuration: this.STUDY_CONFIG.breakDuration,
      });
    }
    // Đảm bảo không có session nào dưới minLen
    return sessions.filter((s) => s.duration >= minLen);
  }

  /**
   * Tạo danh sách sessions sao cho tổng thời lượng ~ targetMinutes, phân bổ đều và theo bước 5 phút
   */
  static buildBalancedSessions(targetMinutes, count, cfg) {
    const sessions = [];

    if (!targetMinutes || targetMinutes <= 0) {
      // fallback: dùng mặc định nếu không có mục tiêu
      return this.buildSessions(
        Math.max(1, count || 1),
        cfg.defaultSessionLength,
        15
      );
    }

    // Nếu chỉ 1 phiên
    if (count <= 1) {
      const dur = Math.max(
        15,
        Math.min(cfg.maxSessionLength, Math.round(targetMinutes / 5) * 5)
      );
      sessions.push({
        duration: dur,
        order: 1,
        needsBreak: false,
        breakDuration: cfg.breakDuration,
      });
      return sessions;
    }

    // Chia đều theo step 5 phút
    const base = Math.floor(targetMinutes / count / 5) * 5;
    let remainder = Math.max(0, targetMinutes - base * count);

    for (let i = 0; i < count; i++) {
      let dur = base;
      if (remainder >= 5) {
        dur += 5;
        remainder -= 5;
      }
      dur = Math.max(cfg.minSessionLength, Math.min(cfg.maxSessionLength, dur));
      sessions.push({
        duration: dur,
        order: i + 1,
        needsBreak: i < count - 1,
        breakDuration: cfg.breakDuration,
      });
    }

    // Điều chỉnh tổng nếu lệch do clamp min/max
    let sum = sessions.reduce((s, x) => s + x.duration, 0);
    if (sum !== targetMinutes) {
      // tăng/giảm dần theo step 5p trong biên min/max để gần target
      const step = sum > targetMinutes ? -5 : 5;
      let idx = 0;
      while (sum !== targetMinutes && idx < sessions.length * 10) {
        const i = idx % sessions.length;
        const next = sessions[i].duration + step;
        if (next >= cfg.minSessionLength && next <= cfg.maxSessionLength) {
          sessions[i].duration = next;
          sum += step;
        }
        idx++;
      }
    }

    return sessions;
  }

  /**
   * Lấy learning pattern phù hợp
   */
  static getLearningPattern(learningGoal) {
    const subject = learningGoal.subject.toLowerCase().replace(/\s+/g, "");
    const category = learningGoal.category;

    // Kiểm tra exact match trước
    if (this.LEARNING_PATTERNS[subject]) {
      return this.LEARNING_PATTERNS[subject];
    }

    // Kiểm tra partial match
    for (const [key, pattern] of Object.entries(this.LEARNING_PATTERNS)) {
      if (subject.includes(key) || key.includes(subject)) {
        return pattern;
      }
    }

    // Fallback theo category
    if (this.LEARNING_PATTERNS[category]) {
      return this.LEARNING_PATTERNS[category];
    }

    return this.LEARNING_PATTERNS.default;
  }

  /**
   * Chọn loại session phù hợp
   */
  static selectSessionType(sessionTypes, sessionOrder) {
    if (sessionTypes.length === 1) {
      return sessionTypes[0];
    }

    // Rotation dựa trên order
    const index = (sessionOrder - 1) % sessionTypes.length;
    return sessionTypes[index];
  }

  /**
   * Kiểm tra có cần break không
   */
  static needsBreak(continuousTime, sessionLength, pattern) {
    const totalTime = continuousTime + sessionLength;
    return (
      totalTime >= pattern.breakAfter && totalTime < pattern.maxContinuousTime
    );
  }

  /**
   * Tìm các khung thời gian trống trong ngày
   */
  static findFreeSlots(dayTasks, dayOfWeek) {
    // Thu thập khoảng bận: tasks (có buffer) + protected windows (trưa/tối)
    const busyIntervals = [];
    for (const task of dayTasks) {
      const taskStart = this.timeToMinutes(task.timeRange.start);
      const taskEnd = this.timeToMinutes(task.timeRange.end);
      busyIntervals.push({ start: taskStart - 15, end: taskEnd + 15 });
    }
    for (const win of this.STUDY_CONFIG.protectedWindows) {
      busyIntervals.push({ start: win.start, end: win.end });
    }

    // Thêm ranh giới ngày
    const dayStart = 6 * 60; // 6:00 AM
    const dayEnd = 22 * 60; // 10:00 PM

    // Gộp khoảng bận chồng lấp
    busyIntervals.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const interval of busyIntervals) {
      if (merged.length === 0) {
        merged.push({ ...interval });
      } else {
        const last = merged[merged.length - 1];
        if (interval.start <= last.end) {
          last.end = Math.max(last.end, interval.end);
        } else {
          merged.push({ ...interval });
        }
      }
    }

    // Tính free slots giữa các khoảng bận
    const freeSlots = [];
    let currentTime = dayStart;
    for (const b of merged) {
      const start = Math.max(currentTime, b.start);
      if (currentTime < b.start) {
        const duration = b.start - currentTime;
        if (duration >= 45) {
          freeSlots.push({ start: currentTime, end: b.start, duration });
        }
      }
      currentTime = Math.max(currentTime, b.end);
    }
    if (currentTime < dayEnd) {
      const duration = dayEnd - currentTime;
      if (duration >= 45)
        freeSlots.push({ start: currentTime, end: dayEnd, duration });
    }

    return freeSlots;
  }

  /**
   * Phân bổ sessions vào các slot trống
   */
  static allocateSimpleSessions(
    sessions,
    freeSlots,
    learningGoal,
    dayOfWeek,
    userId
  ) {
    const generatedTasks = [];
    let sessionIndex = 0;
    let continuousFocus = 0; // phút học liên tục (không tính break)
    let sessionsSinceMacro = 0;

    // Đảm bảo phiên theo thứ tự thời gian trong ngày: duyệt slot theo giờ tăng dần
    const sortedSlots = [...freeSlots].sort((a, b) => a.start - b.start);

    for (const slot of sortedSlots) {
      if (sessionIndex >= sessions.length) break;

      let currentSlotTime = slot.start;
      const slotEnd = slot.end;

      // Mỗi slot chỉ đặt tối đa 1 session để tránh dồn 1 buổi
      const session = sessions[sessionIndex];
      const cfg = this.STUDY_CONFIG;

      // Nếu đã đủ số sessions trước khi cần nghỉ dài, chèn macro break
      if (
        sessionsSinceMacro >= cfg.macroBreakAfterSessions &&
        currentSlotTime + cfg.macroBreakMin <= slotEnd
      ) {
        const macroBreakTask = {
          userId: userId,
          title: `Nghỉ dài`,
          note: `Phục hồi sau các buổi học liên tiếp`,
          weekdays: [dayOfWeek],
          timeRange: {
            start: this.minutesToTime(currentSlotTime),
            end: this.minutesToTime(currentSlotTime + cfg.macroBreakMin),
          },
          color: "#64748b",
          isActive: true,
          isAutoGenerated: true,
          learningGoalId: learningGoal._id,
        };
        generatedTasks.push(macroBreakTask);
        currentSlotTime += cfg.macroBreakMin;
        continuousFocus = 0;
        sessionsSinceMacro = 0;
      }

      // Tính tổng thời gian cần thiết trong slot cho 1 session: prep + study + wrap + (break nếu còn session sau)
      const needsMicroBreak = session.needsBreak;
      const totalRequired =
        cfg.prepBufferMin +
        session.duration +
        cfg.wrapBufferMin +
        (needsMicroBreak ? cfg.breakDuration : 0);

      if (currentSlotTime + totalRequired > slotEnd) {
        continue; // không đủ chỗ trong slot này, thử slot tiếp theo theo thời gian
      }

      // Nếu vượt quá giới hạn tập trung liên tục, cố gắng chèn macro break (đã xử lý ở trên). Nếu vẫn vượt, rời slot.
      if (continuousFocus + session.duration > cfg.maxContinuousTime) {
        if (currentSlotTime + cfg.macroBreakMin + totalRequired <= slotEnd) {
          // chèn macro break trước
          const macroBreakTask2 = {
            userId: userId,
            title: `Nghỉ dài`,
            note: `Phục hồi trước buổi học tiếp theo`,
            weekdays: [dayOfWeek],
            timeRange: {
              start: this.minutesToTime(currentSlotTime),
              end: this.minutesToTime(currentSlotTime + cfg.macroBreakMin),
            },
            color: "#64748b",
            isActive: true,
            isAutoGenerated: true,
            learningGoalId: learningGoal._id,
          };
          generatedTasks.push(macroBreakTask2);
          currentSlotTime += cfg.macroBreakMin;
          continuousFocus = 0;
          sessionsSinceMacro = 0;
        } else {
          continue; // không thể chèn, chuyển slot theo thời gian
        }
      }

      // Áp dụng buffer chuẩn bị
      const studyStart = currentSlotTime + cfg.prepBufferMin;
      const studyEnd = studyStart + session.duration;

      // Tạo task học
      const studyTask = {
        userId: userId,
        title: `${learningGoal.subject} - Session ${session.order}`,
        note: `Tự động tạo từ mục tiêu học tập: ${learningGoal.subject}`,
        weekdays: [dayOfWeek],
        timeRange: {
          start: this.minutesToTime(studyStart),
          end: this.minutesToTime(studyEnd),
        },
        color: learningGoal.color || "#10B981",
        isActive: true,
        isAutoGenerated: true,
        learningGoalId: learningGoal._id,
      };
      generatedTasks.push(studyTask);

      // Cập nhật thời gian sau wrap buffer
      let afterStudy = studyEnd + cfg.wrapBufferMin;

      // Thêm micro break nếu còn phiên tiếp theo trong ngày
      if (needsMicroBreak && afterStudy + cfg.breakDuration <= slotEnd) {
        const breakTask = {
          userId: userId,
          title: `Nghỉ giải lao`,
          note: `Break sau ${learningGoal.subject}`,
          weekdays: [dayOfWeek],
          timeRange: {
            start: this.minutesToTime(afterStudy),
            end: this.minutesToTime(afterStudy + cfg.breakDuration),
          },
          color: "#6B7280",
          isActive: true,
          isAutoGenerated: true,
          learningGoalId: learningGoal._id,
        };
        generatedTasks.push(breakTask);
        afterStudy += cfg.breakDuration;
        continuousFocus = 0; // nghỉ ngắn reset tập trung
        sessionsSinceMacro += 1;
      } else {
        // Không thêm break (do không cần hoặc không đủ chỗ)
        continuousFocus += session.duration;
        sessionsSinceMacro += 1;
      }

      sessionIndex++;
    }

    return generatedTasks;
  }

  /**
   * Ưu tiên các slot theo pattern preferred times
   */
  static prioritizeSlotsByPattern(freeSlots, preferredTimes) {
    return freeSlots.sort((a, b) => {
      const aScore = this.getTimeSlotScore(a.start, preferredTimes);
      const bScore = this.getTimeSlotScore(b.start, preferredTimes);
      return bScore - aScore; // Cao nhất trước
    });
  }

  /**
   * Tính điểm cho time slot dựa trên preferred times
   */
  static getTimeSlotScore(timeStr, preferredTimes) {
    const hour = parseInt(timeStr.split(":")[0]);

    let score = 0;
    for (const timeType of preferredTimes) {
      switch (timeType) {
        case "morning":
          if (hour >= 6 && hour < 12) score += 10;
          break;
        case "afternoon":
          if (hour >= 12 && hour < 18) score += 10;
          break;
        case "evening":
          if (hour >= 18 && hour < 22) score += 10;
          break;
      }
    }

    return score;
  }

  /**
   * Ưu tiên các slot theo preferred time (legacy)
   */
  static prioritizeSlots(slots, preferredTimeSlots) {
    return slots
      .map((slot) => {
        const hour = Math.floor(slot.start / 60);
        const timeSlotCategory = this.getTimeSlotCategory(hour);

        return {
          ...slot,
          priority: preferredTimeSlots.includes(timeSlotCategory) ? 1 : 0,
        };
      })
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Lấy category của time slot
   */
  static getTimeSlotCategory(hour) {
    if (hour >= 5 && hour < 8) return "early-morning";
    if (hour >= 8 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }

  /**
   * Convert time string to minutes
   */
  static timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(":").map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Convert minutes to time string
   */
  static minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}`;
  }

  /**
   * Xóa các task auto-generated của learning goal
   */
  static async removeAutoGeneratedTasks(learningGoalId) {
    await Task.deleteMany({
      learningGoalId: learningGoalId,
      isAutoGenerated: true,
    });
  }

  /**
   * Cập nhật tasks khi learning goal thay đổi
   */
  static async updateTasksForLearningGoal(userId, learningGoal) {
    // Xóa tasks cũ
    await this.removeAutoGeneratedTasks(learningGoal._id);

    // Tạo tasks mới (chỉ cho ngày hiện tại và tương lai)
    return await this.generateTasksFromLearningGoal(userId, learningGoal);
  }
}
