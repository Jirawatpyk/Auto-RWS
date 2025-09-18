const { pushStatusUpdate } = require("../Dashboard/server");

class TaskQueue {
  constructor({ concurrency = 3, onSuccess, onError, onQueueEmpty }) {
    this.queue = [];
    this.processing = new Set();
    this.concurrency = concurrency;
    this.onSuccess = onSuccess;
    this.onError = onError;
    this.onQueueEmpty = onQueueEmpty;
  }

  addTask(taskFn) {
    this.queue.push(taskFn);
    this.processQueue();
  }

  async processQueue() {
    while (this.processing.size < this.concurrency && this.queue.length > 0) {
      const taskFn = this.queue.shift();
      const task = taskFn();
      this.processing.add(task);

      // ✅ ส่งสถานะใหม่ไป Dashboard
      pushStatusUpdate();

      try {
        const result = await task;
        this.processing.delete(task);
        if (this.onSuccess) this.onSuccess(result);
      } catch (error) {
        this.processing.delete(task);
        if (this.onError) this.onError(error);
      }

      // ✅ เช็กว่าคิวว่างแล้วหรือยัง
      if (this.queue.length === 0 && this.processing.size === 0) {
        if (this.onQueueEmpty) this.onQueueEmpty();
      }

      // ✅ อัปเดตสถานะหลังจบงาน
      pushStatusUpdate();
    }
  }
}

module.exports = {
  TaskQueue
};
