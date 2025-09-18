// Dashboard/statusManager/taskStatusStore.js

let status = {
  pending: 0,
  success: 0,
  error: 0
};

function incrementStatus(type) {
  if (status.hasOwnProperty(type)) {
    status[type]++;
  }
}

function getAllStatus() {
  return { ...status };
}

function resetStatus() {
  status = {
    pending: 0,
    success: 0,
    error: 0
  };
}

module.exports = {
  incrementStatus,
  getAllStatus,
  resetStatus
};
