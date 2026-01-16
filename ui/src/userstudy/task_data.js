var taskDatasets = {
    supercomputer: {
      domain: "supercomputer",
      tasks: [
        {
          "qtype": "searching",
          "question": "Which nodes have high ampiltude outlyingness for col_idle?",
          "atype": "multiple",
          "answer": [""]
        },
        {
          "qtype": "searching", 
          "question": "Which nodes have high phase outlyingness for cpu_cycles?",
          "atype": "multiple",
          "answer": [""]
        },
        {
          "qtype": "searching", 
          "question": "Which nodes have both high amplitude and phase outlyingness for cache_misses?",
          "atype": "multiple",
          "answer": [""]
        },
        {
          "qtype": "searching", 
          "question": "Which nodes have high amplitude outlyingness across all variables?",
          "atype": "multiple",
          "answer": [""]
        },
        {
          "qtype": "tracing",
          "question": "Given nodes 6, 7, and 11, which variable(s) contributed most to the amplitude and/or phase outlyingness labels for these nodes?",
          "atype": "multiple",
          "answer": [""] 
        },
      ]
    },
    activity:  {
      domain: "activity",
      tasks: [
        {
          "qtype": "searching",
          "question": "Which participants have high ampiltude outlyingness for walking?",
          "atype": "multiple",
          "answer": [""] 
        },
        {
          "qtype": "searching", 
          "question": "Which participants have high phase outlyingness for jogging?",
          "atype": "multiple",
          "answer": [""] 
        },
        {
          "qtype": "searching", 
          "question": "Which participants have both high amplitude and phase outlyingness for walking?",
          "atype": "multiple",
          "answer": [""] 
        },
        {
          "qtype": "searching", 
          "question": "Which participants have high amplitude outlyingness across all variables?",
          "atype": "multiple",
          "answer": [""] 
        },
        {
          "qtype": "tracing",
          "question": "Given participants 1611, 1633, and 1644, which variable(s) contributed most to the amplitude and/or phase outlyingness labels for these participants?",
          "atype": "multiple",
          "answer": [""] 
        },
      ]
    }
  };