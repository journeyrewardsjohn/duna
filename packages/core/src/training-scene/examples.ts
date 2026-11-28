/**
 * The six hand-authored drills from the Drill Studio prototype (`src/drills.js`),
 * ported verbatim. Places are named spots and areas; the layout engine
 * computes metres. One cart in the first drill is pinned in metres to show how
 * a coach's manual placement survives. Used as fixtures and in tests.
 */
export const trainingSceneExamples: readonly Record<string, unknown>[] = [
  {
    schema: "duna.drill/2",
    id: "serve-receive-sideout",
    view: {
      camera: "three",
    },
    title: "Serve receive to side-out",
    court: {
      type: "beach",
      net: "women",
    },
    meta: {
      durationMinutes: 15,
      intensity: 6,
      players: {
        min: 4,
        max: 6,
        recommended: 4,
      },
      focus: "serve-receive",
      level: "Beginner to intermediate",
    },
    teaching: {
      objective:
        "Pass a served ball to the target, then side out: high set, cross-court attack.",
      successCriteria: [
        "7 of 10 passes land within 1 m of the target",
        "The attack lands in the court",
      ],
      cues: [
        {
          step: "s1",
          text: "Serve at a person, not at space.",
        },
        {
          step: "s2",
          text: "Face the target before the ball arrives. Quiet platform.",
        },
        {
          step: "s3",
          text: "Square to the attacker. High, 1 m off the net.",
        },
        {
          step: "s4",
          text: "Start the approach as the set leaves the setter's hands.",
        },
      ],
      commonErrors: [
        "Passer swings the arms at the ball",
        "Setter arrives late and sets on the run",
        "Attacker approaches before the set is up",
      ],
      simplify:
        "Coach tosses a free ball from the other side instead of a serve.",
      progress: "Server aims at the seam; the pair calls who takes it.",
    },
    people: [
      {
        id: "p1",
        label: "P1",
      },
      {
        id: "p2",
        label: "P2",
      },
      {
        id: "p3",
        label: "P3",
      },
      {
        id: "p4",
        label: "P4",
      },
    ],
    slots: [
      {
        id: "srv",
        side: "B",
        role: "Server",
        spot: "server-right",
        occupant: "p1",
      },
      {
        id: "feed",
        side: "B",
        role: "Next server",
        spot: {
          spot: "server-right",
          right: 1.5,
        },
        occupant: "p4",
        waiting: true,
      },
      {
        id: "passL",
        side: "A",
        role: "Left passer, then attacks",
        spot: "passer-left",
        occupant: "p2",
      },
      {
        id: "passR",
        side: "A",
        role: "Right passer, then sets",
        spot: "passer-right",
        occupant: "p3",
      },
    ],
    supply: [
      {
        id: "cart",
        kind: "cart",
        side: "B",
        pos: {
          x: -5.4,
          y: 8.4,
        },
        label: "Balls",
        pinned: true,
      },
    ],
    balls: [
      {
        id: "b1",
        start: {
          slot: "srv",
        },
      },
    ],
    equipment: [
      {
        id: "tgt",
        kind: "target",
        side: "A",
        spot: "set-target",
        label: "Pass target",
      },
    ],
    zones: [
      {
        id: "zserve",
        kind: "target",
        side: "A",
        area: "deep-left",
        label: "Serve here",
      },
    ],
    rep: {
      ballsBetweenReps: "supply",
      restSeconds: 6,
      steps: [
        {
          id: "s1",
          caption: "{srv} serves to {passL}.",
          actions: [
            {
              actor: "srv",
              verb: "serve",
              ball: "b1",
              to: {
                slot: "passL",
              },
            },
          ],
        },
        {
          id: "s2",
          caption: "{passL} passes to the target. {passR} releases to set.",
          actions: [
            {
              actor: "passL",
              verb: "pass",
              ball: "b1",
              to: {
                spot: "set-target",
              },
            },
            {
              actor: "passR",
              verb: "transition",
              to: {
                spot: "set-target",
                back: 0.3,
              },
            },
            {
              actor: "passL",
              verb: "transition",
              to: {
                spot: "approach-left",
              },
              delay: 0.2,
            },
          ],
        },
        {
          id: "s3",
          caption: "{passR} sets {passL} high on the left.",
          actions: [
            {
              actor: "passR",
              verb: "set",
              ball: "b1",
              to: {
                spot: "attack-left",
              },
            },
          ],
        },
        {
          id: "s4",
          caption: "{passL} attacks cross-court into the deep corner.",
          actions: [
            {
              actor: "passL",
              verb: "attack",
              ball: "b1",
              to: {
                area: "deep-corner-left",
                side: "B",
              },
            },
          ],
        },
      ],
    },
    rotation: {
      kind: "cycle",
      every: 5,
      caption:
        "After 5 serves: server and next server swap, and the passers swap sides.",
      map: {
        srv: "feed",
        feed: "srv",
        passL: "passR",
        passR: "passL",
      },
    },
  },
  {
    schema: "duna.drill/2",
    id: "partner-pepper",
    view: {
      camera: "three",
    },
    title: "Partner pepper",
    court: {
      type: "beach-half",
      net: "women",
    },
    rules: {
      threeTouches: false,
    },
    meta: {
      durationMinutes: 8,
      intensity: 4,
      players: {
        min: 2,
        max: 2,
        recommended: 2,
      },
      focus: "ball-control",
      level: "All levels",
      note: "Run several pairs side by side.",
    },
    teaching: {
      objective:
        "Ball control with a partner: dig, set, hit, and keep the ball off the sand.",
      successCriteria: ["20 contacts in a row without the ball dropping"],
      cues: [
        {
          step: "s1",
          text: "Hit at your partner's chest, at a speed they can dig.",
        },
        {
          step: "s2",
          text: "Dig up and toward your partner, not at them.",
        },
        {
          step: "s3",
          text: "Hands up early, set from your forehead.",
        },
        {
          step: "s5",
          text: "Low and still before the hit comes.",
        },
      ],
      commonErrors: [
        "Hitting too hard to control",
        "Digging flat so the partner has to chase",
        "Standing tall before the dig",
      ],
      simplify: "Replace the hit with a two-hand toss.",
      progress:
        "Move 2 m further apart; every dig must reach the partner's forehead.",
    },
    people: [
      {
        id: "p1",
        label: "P1",
      },
      {
        id: "p2",
        label: "P2",
      },
    ],
    slots: [
      {
        id: "L",
        side: "A",
        role: "Partner",
        spot: "pepper-left",
        occupant: "p1",
      },
      {
        id: "R",
        side: "A",
        role: "Partner",
        spot: "pepper-right",
        occupant: "p2",
      },
    ],
    balls: [
      {
        id: "b1",
        start: {
          slot: "L",
        },
      },
    ],
    rep: {
      ballsBetweenReps: "continuous",
      restSeconds: 0,
      steps: [
        {
          id: "s1",
          caption: "{L} hits a controlled ball at {R}.",
          actions: [
            {
              actor: "L",
              verb: "hit",
              ball: "b1",
              to: {
                slot: "R",
              },
            },
          ],
        },
        {
          id: "s2",
          caption: "{R} digs it high to {L}.",
          actions: [
            {
              actor: "R",
              verb: "dig",
              ball: "b1",
              to: {
                slot: "L",
              },
            },
          ],
        },
        {
          id: "s3",
          caption: "{L} sets it back to {R}.",
          actions: [
            {
              actor: "L",
              verb: "set",
              ball: "b1",
              to: {
                slot: "R",
              },
            },
          ],
        },
        {
          id: "s4",
          caption: "{R} hits at {L}.",
          actions: [
            {
              actor: "R",
              verb: "hit",
              ball: "b1",
              to: {
                slot: "L",
              },
            },
          ],
        },
        {
          id: "s5",
          caption: "{L} digs it high to {R}.",
          actions: [
            {
              actor: "L",
              verb: "dig",
              ball: "b1",
              to: {
                slot: "R",
              },
            },
          ],
        },
        {
          id: "s6",
          caption: "{R} sets back to {L}. The cycle repeats.",
          actions: [
            {
              actor: "R",
              verb: "set",
              ball: "b1",
              to: {
                slot: "L",
              },
            },
          ],
        },
      ],
    },
    rotation: {
      kind: "cycle",
      every: 10,
      caption:
        "Every 10 cycles, switch ends so both partners face the sun and wind.",
      map: {
        L: "R",
        R: "L",
      },
    },
  },
  {
    schema: "duna.drill/2",
    id: "serving-to-targets",
    title: "Serving to deep targets",
    view: {
      camera: "broadcast",
    },
    court: {
      type: "beach",
      net: "women",
    },
    meta: {
      durationMinutes: 10,
      intensity: 3,
      players: {
        min: 4,
        max: 8,
        recommended: 6,
      },
      focus: "serving",
      level: "All levels",
    },
    teaching: {
      objective: "Serve deep, into the last 2 metres, the same way every time.",
      successCriteria: [
        "6 of 10 serves land in the deep band",
        "No more than 2 of 10 in the net",
      ],
      cues: [
        {
          step: "s1",
          text: "Same toss every time, in front of the hitting shoulder.",
        },
        {
          step: "s2",
          text: "Firm wrist. Finish toward the target.",
        },
      ],
      commonErrors: [
        "Toss drifts behind the head",
        "Watching the target instead of the ball at contact",
      ],
      simplify:
        "Serve from 3 m inside the baseline; widen the target to the last 3 m.",
      progress: "Call a corner before each serve; score only called corners.",
    },
    people: [
      {
        id: "p1",
        label: "P1",
      },
      {
        id: "p2",
        label: "P2",
      },
      {
        id: "p3",
        label: "P3",
      },
      {
        id: "p4",
        label: "P4",
      },
      {
        id: "p5",
        label: "P5",
      },
      {
        id: "p6",
        label: "P6",
      },
    ],
    slots: [
      {
        id: "srvA",
        side: "A",
        role: "Server",
        spot: "server-middle",
        occupant: "p1",
      },
      {
        id: "qA0",
        side: "A",
        role: "Next in line",
        spot: "queue-right#0",
        occupant: "p2",
        waiting: true,
      },
      {
        id: "qA1",
        side: "A",
        role: "In line",
        spot: "queue-right#1",
        occupant: "p3",
        waiting: true,
      },
      {
        id: "srvB",
        side: "B",
        role: "Server",
        spot: "server-middle",
        occupant: "p4",
      },
      {
        id: "qB0",
        side: "B",
        role: "Next in line",
        spot: "queue-right#0",
        occupant: "p5",
        waiting: true,
      },
      {
        id: "qB1",
        side: "B",
        role: "In line",
        spot: "queue-right#1",
        occupant: "p6",
        waiting: true,
      },
    ],
    supply: [
      {
        id: "cartA",
        kind: "cart",
        side: "A",
        spot: "cart-right",
        label: "Balls",
      },
      {
        id: "cartB",
        kind: "cart",
        side: "B",
        spot: "cart-right",
        label: "Balls",
      },
    ],
    balls: [
      {
        id: "b1",
        start: {
          slot: "srvA",
        },
      },
      {
        id: "b2",
        start: {
          slot: "srvB",
        },
      },
    ],
    equipment: [
      {
        id: "tB1",
        kind: "cone",
        side: "B",
        area: "deep-corner-left",
        label: "Cone",
      },
      {
        id: "tA1",
        kind: "cone",
        side: "A",
        area: "deep-corner-right",
        label: "Cone",
      },
    ],
    zones: [
      {
        id: "zB",
        kind: "target",
        side: "B",
        area: "deep-band",
        label: "Last 2 m",
      },
      {
        id: "zA",
        kind: "target",
        side: "A",
        area: "deep-band",
        label: "Last 2 m",
      },
    ],
    rep: {
      ballsBetweenReps: "supply",
      restSeconds: 5,
      steps: [
        {
          id: "s1",
          caption: "{srvA} serves deep, into the last 2 m on side B.",
          actions: [
            {
              actor: "srvA",
              verb: "serve",
              ball: "b1",
              to: {
                area: "deep-corner-left",
                side: "B",
              },
            },
          ],
        },
        {
          id: "s2",
          after: "previous",
          gap: 0.6,
          caption: "{srvB} serves back, into the last 2 m on side A.",
          actions: [
            {
              actor: "srvB",
              verb: "serve",
              ball: "b2",
              to: {
                area: "deep-corner-right",
                side: "A",
              },
            },
          ],
        },
      ],
    },
    rotation: {
      kind: "lines",
      every: 1,
      caption:
        "Each server fetches a ball and joins the back of their own line. The next player steps up.",
      map: {
        srvA: "qA1",
        qA0: "srvA",
        qA1: "qA0",
        srvB: "qB1",
        qB0: "srvB",
        qB1: "qB0",
      },
    },
  },
  {
    schema: "duna.drill/2",
    id: "dig-to-transition",
    view: {
      camera: "three",
    },
    title: "Dig to transition attack",
    court: {
      type: "beach",
      net: "women",
    },
    meta: {
      durationMinutes: 12,
      intensity: 7,
      players: {
        min: 3,
        max: 5,
        recommended: 4,
      },
      focus: "defense-transition",
      level: "Intermediate",
      coachRequired: true,
    },
    teaching: {
      objective:
        "Turn a dug ball into a point: dig high to the middle, pull off and set, transition and attack.",
      successCriteria: [
        "Dig reaches the middle third of the court, above net height",
        "5 of 10 transition attacks land in",
      ],
      cues: [
        {
          step: "s1",
          text: "Defender: stopped and low when the coach contacts.",
        },
        {
          step: "s2",
          text: "Dig high and to the middle. Blocker: land, turn, release.",
        },
        {
          step: "s3",
          text: "Set high to buy your partner time.",
        },
        {
          step: "s4",
          text: "Look at the open line before you jump.",
        },
      ],
      commonErrors: [
        "Defender still moving at contact",
        "Dig goes tight to the net",
        "Blocker turns to watch instead of releasing",
      ],
      simplify:
        "Coach hits at the defender from the same side, standing on the sand.",
      progress:
        "Coach mixes hard hits with short shots the defender must chase.",
    },
    people: [
      {
        id: "c1",
        label: "C",
      },
      {
        id: "p1",
        label: "P1",
      },
      {
        id: "p2",
        label: "P2",
      },
      {
        id: "p3",
        label: "P3",
      },
      {
        id: "p4",
        label: "P4",
      },
    ],
    slots: [
      {
        id: "coach",
        side: "B",
        kind: "coach",
        role: "Coach on a box",
        spot: "coach-box-net",
        onBox: 0.6,
        occupant: "c1",
      },
      {
        id: "blk",
        side: "A",
        role: "Blocks line, then sets",
        spot: {
          spot: "blocker",
          right: -2,
        },
        occupant: "p1",
      },
      {
        id: "def",
        side: "A",
        role: "Digs, then attacks",
        spot: "defender-deep",
        occupant: "p2",
      },
      {
        id: "q0",
        side: "A",
        role: "Next in",
        spot: "queue-right#0",
        occupant: "p3",
        waiting: true,
      },
      {
        id: "q1",
        side: "A",
        role: "In line",
        spot: "queue-right#1",
        occupant: "p4",
        waiting: true,
      },
    ],
    supply: [
      {
        id: "cart",
        kind: "cart",
        side: "B",
        spot: {
          spot: "coach-box-net",
          right: 1.6,
        },
        label: "Balls",
      },
    ],
    balls: [
      {
        id: "b1",
        start: {
          slot: "coach",
        },
      },
    ],
    equipment: [
      {
        id: "box",
        kind: "box",
        side: "B",
        spot: "coach-box-net",
        label: "Box",
      },
    ],
    rep: {
      ballsBetweenReps: "supply",
      restSeconds: 5,
      steps: [
        {
          id: "s1",
          caption:
            "{blk} blocks the line. {coach} hits cross, past the block, at {def}.",
          actions: [
            {
              actor: "blk",
              verb: "block",
            },
            {
              actor: "coach",
              verb: "hit",
              ball: "b1",
              to: {
                slot: "def",
                right: 1.5,
              },
            },
          ],
        },
        {
          id: "s2",
          caption:
            "{def} digs high to the middle. {blk} pulls off the net to set.",
          actions: [
            {
              actor: "def",
              verb: "dig",
              ball: "b1",
              to: {
                spot: "set-target",
              },
            },
            {
              actor: "blk",
              verb: "transition",
              to: {
                spot: "set-target",
                back: 0.3,
              },
            },
            {
              actor: "def",
              verb: "transition",
              to: {
                spot: "approach-left",
              },
              delay: 0.2,
            },
          ],
        },
        {
          id: "s3",
          caption: "{blk} sets {def} on the left.",
          actions: [
            {
              actor: "blk",
              verb: "set",
              ball: "b1",
              to: {
                spot: "attack-left",
              },
            },
          ],
        },
        {
          id: "s4",
          caption: "{def} attacks down the line.",
          actions: [
            {
              actor: "def",
              verb: "attack",
              ball: "b1",
              to: {
                area: "deep-corner-right",
                side: "B",
              },
            },
          ],
        },
      ],
    },
    rotation: {
      kind: "cycle",
      every: 1,
      caption:
        "Defender goes to the back of the line, blocker drops back to defend, next player blocks.",
      map: {
        def: "q1",
        q1: "q0",
        q0: "blk",
        blk: "def",
      },
    },
  },
  {
    schema: "duna.drill/2",
    id: "king-of-the-court",
    view: {
      camera: "three",
    },
    title: "King of the court",
    court: {
      type: "beach",
      net: "women",
    },
    meta: {
      durationMinutes: 15,
      intensity: 8,
      players: {
        min: 6,
        max: 9,
        recommended: 6,
      },
      focus: "game-play",
      level: "Intermediate",
      note: "Also called queen of the court.",
    },
    teaching: {
      objective:
        "Game pressure: the king side must side out to stay on and score. Challengers must win a rally to take the king side.",
      successCriteria: [
        "First pair to 7 points on the king side wins",
        "King side sides out on at least half its receives",
      ],
      cues: [
        {
          step: "s1",
          text: "Challengers: serve tough, then get in to defend.",
        },
        {
          step: "s2",
          text: "King side: pass high, give your partner time.",
        },
        {
          step: "s3",
          text: "Blocker: take the line, trust the defender for the cross.",
        },
        {
          step: "s4",
          text: "Attacker: see the block, hit away from it.",
        },
      ],
      commonErrors: [
        "Server watches the serve instead of running in",
        "King side rushes the set",
      ],
      simplify: "Coach starts every rally with a free ball to the king side.",
      progress:
        "Kings score only on a kill; challengers win the side on any rally win.",
    },
    people: [
      {
        id: "p1",
        label: "P1",
      },
      {
        id: "p2",
        label: "P2",
      },
      {
        id: "p3",
        label: "P3",
      },
      {
        id: "p4",
        label: "P4",
      },
      {
        id: "p5",
        label: "P5",
      },
      {
        id: "p6",
        label: "P6",
      },
    ],
    slots: [
      {
        id: "k1",
        side: "B",
        role: "King side, left",
        spot: "passer-left",
        occupant: "p1",
      },
      {
        id: "k2",
        side: "B",
        role: "King side, right",
        spot: "passer-right",
        occupant: "p2",
      },
      {
        id: "c1",
        side: "A",
        role: "Challenger, serves",
        spot: "server-right",
        occupant: "p3",
      },
      {
        id: "c2",
        side: "A",
        role: "Challenger, blocks",
        spot: "blocker",
        occupant: "p4",
      },
      {
        id: "w1",
        side: "A",
        role: "Waiting pair",
        spot: "queue-left#0",
        occupant: "p5",
        waiting: true,
      },
      {
        id: "w2",
        side: "A",
        role: "Waiting pair",
        spot: "queue-left#1",
        occupant: "p6",
        waiting: true,
      },
    ],
    supply: [
      {
        id: "cart",
        kind: "cart",
        side: "A",
        spot: "cart-left",
        label: "Balls",
      },
    ],
    balls: [
      {
        id: "b1",
        start: {
          slot: "c1",
        },
      },
    ],
    rep: {
      ballsBetweenReps: "supply",
      restSeconds: 6,
      steps: [
        {
          id: "s1",
          caption: "{c1} jump-serves hard to {k1}.",
          actions: [
            {
              actor: "c1",
              verb: "jumpserve",
              ball: "b1",
              to: {
                slot: "k1",
              },
            },
          ],
        },
        {
          id: "s2",
          caption: "{k1} passes. {k2} releases to set. {c1} runs in to defend.",
          actions: [
            {
              actor: "k1",
              verb: "pass",
              ball: "b1",
              to: {
                spot: "set-target",
              },
            },
            {
              actor: "k2",
              verb: "transition",
              to: {
                spot: "set-target",
                back: 0.3,
              },
            },
            {
              actor: "k1",
              verb: "transition",
              to: {
                spot: "approach-left",
              },
              delay: 0.2,
            },
            {
              actor: "c1",
              verb: "transition",
              to: {
                spot: "defender-deep",
              },
            },
          ],
        },
        {
          id: "s3",
          caption: "{k2} sets {k1}. {c2} slides over to block the line.",
          actions: [
            {
              actor: "k2",
              verb: "set",
              ball: "b1",
              to: {
                spot: "attack-left",
              },
            },
            {
              actor: "c2",
              verb: "shuffle",
              to: {
                spot: "blocker",
                right: 3,
              },
            },
          ],
        },
        {
          id: "s4",
          caption:
            "{k1} hits cross, past the block, into the corner. Rally over: pick the result below to see who stays.",
          actions: [
            {
              actor: "k1",
              verb: "attack",
              ball: "b1",
              to: {
                area: "deep-corner-left",
                side: "A",
              },
            },
            {
              actor: "c2",
              verb: "block",
            },
          ],
        },
      ],
    },
    rotation: {
      kind: "winner-stays",
      every: 1,
      shown: "kings-win",
      outcomes: {
        "kings-win": {
          caption:
            "King side sided out: they stay and score. The challengers leave; the waiting pair comes on to serve.",
          map: {
            c1: "w1",
            c2: "w2",
            w1: "c1",
            w2: "c2",
          },
        },
        "challengers-win": {
          caption:
            "Challengers won the rally: they cross to the king side. The old kings join the line.",
          map: {
            c1: "k1",
            c2: "k2",
            k1: "w1",
            k2: "w2",
            w1: "c1",
            w2: "c2",
          },
        },
      },
    },
  },
  {
    schema: "duna.drill/2",
    id: "indoor-receive-outside",
    view: {
      camera: "three",
    },
    title: "Three-lane receive to outside attack",
    court: {
      type: "indoor",
      net: "women",
    },
    meta: {
      durationMinutes: 15,
      intensity: 6,
      players: {
        min: 6,
        max: 8,
        recommended: 6,
      },
      focus: "serve-receive",
      level: "Intermediate (indoor)",
    },
    teaching: {
      objective:
        "Three-person serve receive into a high outside set. The left lane attacks every ball.",
      successCriteria: [
        "Pass lets the setter set from the target on 6 of 10",
        "Outside attack lands in on 5 of 10",
      ],
      cues: [
        {
          step: "s1",
          text: "Passers: call the ball early. Seams belong to the middle lane.",
        },
        {
          step: "s2",
          text: "Left lane: as soon as you are not passing, open out to the sideline.",
        },
        {
          step: "s3",
          text: "Setter: high and to the antenna, a little off the net.",
        },
        {
          step: "s4",
          text: "Cover: middle and right lanes close in behind the attacker.",
        },
      ],
      commonErrors: [
        "Two passers go for the same ball",
        "Outside approaches from inside the court and gets jammed",
      ],
      simplify: "Coach tosses a free ball over the net instead of a serve.",
      progress:
        "Server picks any lane; whoever does not pass on the left becomes the attacker.",
    },
    people: [
      {
        id: "p1",
        label: "P1",
      },
      {
        id: "p2",
        label: "P2",
      },
      {
        id: "p3",
        label: "P3",
      },
      {
        id: "p4",
        label: "P4",
      },
      {
        id: "p5",
        label: "P5",
      },
      {
        id: "p6",
        label: "P6",
      },
    ],
    slots: [
      {
        id: "srv",
        side: "B",
        role: "Server",
        spot: "server-right",
        occupant: "p1",
      },
      {
        id: "nxt",
        side: "B",
        role: "Next server",
        spot: {
          spot: "server-right",
          right: 1.6,
        },
        occupant: "p6",
        waiting: true,
      },
      {
        id: "laneL",
        side: "A",
        role: "Left lane, attacks",
        spot: "passer-left",
        occupant: "p2",
      },
      {
        id: "laneM",
        side: "A",
        role: "Middle lane",
        spot: "passer-middle",
        occupant: "p3",
      },
      {
        id: "laneR",
        side: "A",
        role: "Right lane",
        spot: "passer-right",
        occupant: "p4",
      },
      {
        id: "setter",
        side: "A",
        role: "Setter",
        spot: "setter-base",
        occupant: "p5",
      },
    ],
    supply: [
      {
        id: "cart",
        kind: "cart",
        side: "B",
        spot: "cart-right",
        label: "Balls",
      },
    ],
    balls: [
      {
        id: "b1",
        start: {
          slot: "srv",
        },
      },
    ],
    equipment: [
      {
        id: "tgt",
        kind: "target",
        side: "A",
        spot: "set-target",
        label: "Target",
      },
    ],
    zones: [
      {
        id: "z5",
        kind: "target",
        side: "B",
        area: "zone5",
        label: "Zone 5",
      },
    ],
    rep: {
      ballsBetweenReps: "supply",
      restSeconds: 6,
      steps: [
        {
          id: "s1",
          caption: "{srv} serves to {laneM} in the middle lane.",
          actions: [
            {
              actor: "srv",
              verb: "serve",
              ball: "b1",
              to: {
                slot: "laneM",
              },
            },
          ],
        },
        {
          id: "s2",
          caption:
            "{laneM} passes to the target. {setter} moves under it. {laneL} opens out to approach.",
          actions: [
            {
              actor: "laneM",
              verb: "pass",
              ball: "b1",
              to: {
                spot: "set-target",
              },
            },
            {
              actor: "setter",
              verb: "move",
              to: {
                spot: "set-target",
                back: 0.3,
              },
            },
            {
              actor: "laneL",
              verb: "transition",
              to: {
                spot: "approach-left",
              },
            },
          ],
        },
        {
          id: "s3",
          caption:
            "{setter} sets {laneL} high at the left antenna. {laneM} and {laneR} close in to cover.",
          actions: [
            {
              actor: "setter",
              verb: "set",
              ball: "b1",
              to: {
                spot: "attack-left",
              },
            },
            {
              actor: "laneM",
              verb: "move",
              to: {
                spot: "attack-left",
                right: 1.4,
                back: 2,
              },
            },
            {
              actor: "laneR",
              verb: "move",
              to: {
                spot: "attack-left",
                right: 3,
                back: 3.4,
              },
            },
          ],
        },
        {
          id: "s4",
          caption: "{laneL} attacks cross-court into zone 5.",
          actions: [
            {
              actor: "laneL",
              verb: "attack",
              ball: "b1",
              to: {
                area: "zone5",
                side: "B",
              },
            },
          ],
        },
      ],
    },
    rotation: {
      kind: "cycle",
      every: 6,
      caption:
        "Every 6 serves: passers shift one lane (left to middle, middle to right, right to left) and the servers swap. The setter stays.",
      map: {
        laneL: "laneM",
        laneM: "laneR",
        laneR: "laneL",
        srv: "nxt",
        nxt: "srv",
      },
    },
  },
];
