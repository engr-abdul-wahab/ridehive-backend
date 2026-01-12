exports.handlers = {
  logger: {
    success: ({ object_type, code = 200, message, data = null }) =>
      console.info({ object_type, code, status: 1, message, data }),

    failed: ({ object_type, code = 400, message, data = null }) =>
      console.error({ object_type, code, status: 0, message, data }),

    error: ({ object_type, code = 500, message, data = null }) =>
      console.error({ object_type, code, status: 0, message, data }),

    unavailable: ({ object_type, code = 404, message, data = null }) =>
      console.warn({ object_type, code, status: 0, message, data }),

    unauthorized: ({ object_type, code = 403, message, data = null }) =>
      console.warn({ object_type, code, status: 0, message, data }),
    nocontent: ({ object_type, code = 204, message, data = null }) =>
      console.info({ object_type, code, status: 1, message, data }),
  },

  response: {
    success: ({ res, code = 200, message, data = null }) =>
      res.status(code).send({ status: 1, message, data }),

    failed: ({ res, code = 400, message, data = null }) =>
      res.status(code).send({ status: 0, message, data }),

    error: ({ res, code = 500, message, data = null }) =>
      res.status(code).send({ status: 0, message, data }),

    unavailable: ({ res, code = 404, message, data = null }) =>
      res.status(code).send({ status: 0, message, data }),

    unauthorized: ({ res, code = 403, message, data = null }) =>
      res.status(code).send({ status: 0, message, data }),
    nocontent: ({ res, code = 200, message = "No Content", data = null }) =>
      res.status(code).send({ status: 1, message, data }),
  },

  event: {
    success: ({ object_type, message, data = null, code = 200 }) => ({
      object_type,
      code,
      status: 1,
      message,
      data,
    }),
    failed: ({ object_type, message, data = null, code = 400 }) => ({
      object_type,
      code,
      status: 0,
      message,
      data,
    }),
    error: ({ object_type, message, data = null, code = 500 }) => ({
      object_type,
      code,
      status: 0,
      message,
      data,
    }),
    unavailable: ({ object_type, message, data = null, code = 404 }) => ({
      object_type,
      code,
      status: 0,
      message,
      data,
    }),
    unauthorized: ({ object_type, message, data = null, code = 403 }) => ({
      object_type,
      code,
      status: 0,
      message,
      data,
    }),
    nocontent: ({
      object_type,
      message = "No Content",
      data = null,
      code = 200,
    }) => ({
      object_type,
      code,
      status: 1,
      message,
      data,
    }),
  },

  logAndRespond: ({ res, logType = "success", message = "", data = null }) => {
    let code;
    let status;

    switch (logType) {
      case "error":
        code = 500;
        status = 0;
        break;
      case "nocontent":
        code = 200;
        status = 1;
        break;
      case "failed":
        code = 400;
        status = 0;
        break;
      case "unavailable":
        code = 404;
        status = 0;
        break;
      case "unauthorized":
        code = 403;
        status = 0;
        break;
      default:
        code = 200;
        status = 1;
    }

    return res.status(code).send({ status, message, data });
  },
};
