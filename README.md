<h1 align="center">Unlisted</h1>

<p align="center"><b>Find what the AI didn't list.</b></p>

<p align="center">
A research project and review tool on how AI takeoff tools hide missing items from electrical estimators.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-early%20proposal-B7791F?style=for-the-badge" alt="Status: early proposal">
  <img src="https://img.shields.io/badge/target-HUGS%202027%20%40%20ICSE-0B6B3A?style=for-the-badge" alt="Target: HUGS 2027 at ICSE">
  <img src="https://img.shields.io/badge/license-MIT-56655D?style=for-the-badge" alt="License: MIT">
</p>

<p align="center">
  <a href="#the-problem">The problem</a> &nbsp;•&nbsp;
  <a href="#research-questions">Research questions</a> &nbsp;•&nbsp;
  <a href="#how-it-works">How it works</a> &nbsp;•&nbsp;
  <a href="#roadmap">Roadmap</a> &nbsp;•&nbsp;
  <a href="#about">About</a>
</p>

<br>

## The problem

AI tools now read construction drawings, detect items such as outlets and light fixtures, and turn them into a bid. Before signing, the estimator reviews the output on a **ranked list of what the AI detected**.

An item the AI missed never appears on that list. There is nothing to click, nothing to reject, and no sign that anything is absent. The estimator reaches the end of the list and believes the whole drawing has been checked.

> [!IMPORTANT]
> **The interface asks the estimator to review a list. The estimator believes they reviewed the document.**
> The gap between the two contains only the errors nobody can see. We call this pattern **Verification Scoping**.

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#EAF4EE','primaryBorderColor':'#0B6B3A','primaryTextColor':'#1E2A24','lineColor':'#0B6B3A','clusterBkg':'#F7FAF8','clusterBorder':'#CFE4D7','edgeLabelBackground':'#FFFFFF','taskBkgColor':'#0B6B3A','taskBorderColor':'#07552F','activeTaskBkgColor':'#0B6B3A','activeTaskBorderColor':'#07552F','taskTextColor':'#FFFFFF','taskTextLightColor':'#FFFFFF','taskTextOutsideColor':'#1E2A24','critBkgColor':'#B7791F','critBorderColor':'#8A5A12','sectionBkgColor':'#F7FAF8','altSectionBkgColor':'#FFFFFF','sectionBkgColor2':'#F7FAF8','gridColor':'#CFE4D7','todayLineColor':'#C0392B'}}}%%
flowchart TB
    subgraph NOW["Current review: the reviewer checks the list"]
        direction LR
        A1["Ceiling light · 0.98 ✓"] --> A2["Outlet · 0.95 ✓"] --> A3["Switch · 0.93 ✓"] --> A4["End of list<br/>Review marked complete"]
    end
    NOW -. "never on the list" .- M(["Missed outlet"])
    M == "made visible in Area D" ==> NEXT
    subgraph NEXT["Proposed review: the reviewer checks the drawing"]
        direction LR
        B1["Area A checked ✓"] --> B2["Area B checked ✓"] --> B3["Area C checked ✓"] --> B4["Area D: nothing detected<br/>Check before finishing"]
    end

    classDef ok fill:#EAF4EE,stroke:#0B6B3A,color:#07552F
    classDef warn fill:#FFF4DB,stroke:#B7791F,color:#7A4E0C
    classDef miss fill:#FDECEA,stroke:#C0392B,color:#C0392B
    class A1,A2,A3,A4,B1,B2,B3 ok
    class B4 warn
    class M miss
```

## Research questions

| | Question |
|:--|:--|
| **RQ1** | Does the direction of an AI counting error determine whether an estimator catches it? |
| **RQ2** | How should the review interface be designed so that finishing the list does not feel like finishing the document? |
| **H1** | A missing item is corrected less often than an added item with the same cost impact. |

## How it works

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#EAF4EE','primaryBorderColor':'#0B6B3A','primaryTextColor':'#1E2A24','lineColor':'#0B6B3A','clusterBkg':'#F7FAF8','clusterBorder':'#CFE4D7','edgeLabelBackground':'#FFFFFF','taskBkgColor':'#0B6B3A','taskBorderColor':'#07552F','activeTaskBkgColor':'#0B6B3A','activeTaskBorderColor':'#07552F','taskTextColor':'#FFFFFF','taskTextLightColor':'#FFFFFF','taskTextOutsideColor':'#1E2A24','critBkgColor':'#B7791F','critBorderColor':'#8A5A12','sectionBkgColor':'#F7FAF8','altSectionBkgColor':'#FFFFFF','sectionBkgColor2':'#F7FAF8','gridColor':'#CFE4D7','todayLineColor':'#C0392B'}}}%%
flowchart LR
    subgraph IN["Inputs"]
        direction TB
        I1["Retired electrical<br/>plan sets"] --> I2["Simulated AI output<br/>with planted errors"]
    end
    subgraph EX["Experiment"]
        direction TB
        E1["Estimator reviews<br/>in the interface"] --> E2["Event log<br/>and interview"]
    end
    subgraph OUT["Outputs"]
        direction TB
        O1["Detection rates and<br/>design principles"] --> O2["Unlisted<br/>review tool"]
    end
    IN --> EX --> OUT

    classDef step fill:#FFFFFF,stroke:#0B6B3A,color:#1E2A24
    classDef product fill:#B7791F,stroke:#B7791F,color:#FFFFFF
    class I1,I2,E1,E2,O1 step
    class O2 product
```

<table>
<tr>
<td width="33%" valign="top">

**1. Study**

Professional estimators review simulated AI output on retired electrical plan sets. Missing and added items are matched on cost impact, and every action is logged.

</td>
<td width="33%" valign="top">

**2. Paper**

The findings and design principles are written up for the HUGS 2027 workshop at ICSE.

</td>
<td width="33%" valign="top">

**3. Product**

Unlisted tracks which areas of the drawing have been checked and flags areas where nothing was detected.

</td>
</tr>
</table>

## Roadmap

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#EAF4EE','primaryBorderColor':'#0B6B3A','primaryTextColor':'#1E2A24','lineColor':'#0B6B3A','clusterBkg':'#F7FAF8','clusterBorder':'#CFE4D7','edgeLabelBackground':'#FFFFFF','taskBkgColor':'#0B6B3A','taskBorderColor':'#07552F','activeTaskBkgColor':'#0B6B3A','activeTaskBorderColor':'#07552F','taskTextColor':'#FFFFFF','taskTextLightColor':'#FFFFFF','taskTextOutsideColor':'#1E2A24','critBkgColor':'#B7791F','critBorderColor':'#8A5A12','sectionBkgColor':'#F7FAF8','altSectionBkgColor':'#FFFFFF','sectionBkgColor2':'#F7FAF8','gridColor':'#CFE4D7','todayLineColor':'#C0392B'}}}%%
gantt
    dateFormat YYYY-MM-DD
    axisFormat %b %Y
    tickInterval 1month
    todayMarker off
    section Research
    Study design and plan sets       :r1, 2026-09-01, 2026-09-30
    Interface sessions and analysis  :r2, 2026-10-01, 2026-10-31
    Paper writing                    :r3, 2026-11-01, 2026-11-13
    Paper submitted to HUGS 2027     :milestone, m1, 2026-11-13, 0d
    section Product
    Unlisted review tool             :crit, p1, 2026-11-14, 2026-12-20
```

| Milestone | Date | Status |
|:--|:--|:--:|
| Study design, literature review, plan sets | September 2026 | 🟢 In progress |
| Review interface, study sessions, analysis | October 2026 | ⚪ Planned |
| Paper submitted to HUGS 2027 | 13 November 2026 | ⚪ Planned |
| Unlisted review tool built and tested | December 2026 | ⚪ Planned |

## Repository

```text
.
├── docs/              proposal and poster
├── review-interface/  web app used in the study        (planned)
├── analysis/          scoring and analysis scripts     (planned)
└── improved-tool/     the Unlisted review tool         (planned)
```

> [!NOTE]
> Study materials and participant data are not published, to protect the study design and participant privacy.

## Built with

![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PDF.js](https://img.shields.io/badge/PDF.js-E34F26?style=flat-square&logo=mozilla&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)

## Key references

1. C. M. Gray, C. T. Santos, N. Bielova and T. Mildner, "An Ontology of Dark Patterns Knowledge," *CHI*, 2024.
2. R. Parasuraman and D. H. Manzey, "Complacency and Bias in Human Use of Automation," *Human Factors*, 2010.
3. L. J. Skitka, K. L. Mosier and M. Burdick, "Does Automation Bias Decision Making?" *International Journal of Human-Computer Studies*, 1999.
4. Hamppi, "Integrating AI into Procurement Processes in Construction," MSc thesis, Aalto University, 2025.

## About

Capstone project, B.S. in Computer Science, School of Science and Engineering, **Al Akhawayn University**.

**Mehdi [Last name]**, supervised by **Dr. Hoda Khalafalla**

[your university email] • [LinkedIn](https://www.linkedin.com/in/your-profile)
