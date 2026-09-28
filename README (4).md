<p align="center">
  <img src="assets/banner.png" alt="Unlisted: find what the AI didn't list" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-early%20proposal-B7791F?style=flat-square" alt="Status: early proposal">
  <img src="https://img.shields.io/badge/target-HUGS%202027%20%40%20ICSE-0B6B3A?style=flat-square" alt="Target: HUGS 2027 at ICSE">
  <img src="https://img.shields.io/badge/field-human%20%26%20AI%20interaction-07552F?style=flat-square" alt="Field: human and AI interaction">
  <img src="https://img.shields.io/badge/license-MIT-56655D?style=flat-square" alt="License: MIT">
</p>

<p align="center">
  <b>A research project and a review tool on how AI takeoff tools hide missing items from electrical estimators.</b>
</p>

---

## The problem

AI tools now read construction drawings, detect items such as outlets and light fixtures, and turn them into a bid. The estimator reviews this output before signing.

That review happens on a **ranked list of what the AI detected**. An item the AI missed never appears on the list: nothing to click, nothing to reject, no sign that anything is absent. The estimator reaches the end of the list and believes the whole drawing has been checked.

> **The interface asks the estimator to review a list. The estimator believes they reviewed the document.**
> The gap between the two contains only the errors nobody can see.

We call this pattern **Verification Scoping**.

<p align="center">
  <img src="assets/current-vs-proposed-review.png" alt="Current review ends when the list ends; proposed review ends when the whole drawing is checked" width="95%">
</p>

## Research questions

| | Question |
|---|---|
| **RQ1** | Does the direction of an AI counting error determine whether an estimator catches it? |
| **RQ2** | How should the review interface be designed so that finishing the list does not feel like finishing the document? |
| **H1** | A missing item is corrected less often than an added item with the same cost impact. |

## How it works

<p align="center">
  <img src="assets/process.png" alt="Inputs, experiment and outputs of the project" width="95%">
</p>

1. **Study.** Professional estimators review simulated AI output on retired electrical plan sets. Missing items and added items are matched on cost impact, and every action is logged.
2. **Paper.** The findings and design principles are written up for the HUGS 2027 workshop at ICSE.
3. **Product.** Unlisted, a review tool that makes the AI's blind spots visible by tracking which areas of the drawing have been checked and flagging areas where nothing was detected.

## Roadmap

<p align="center">
  <img src="assets/roadmap.png" alt="Six step roadmap from plan sets to the improved review tool" width="95%">
</p>

| Period | Milestone | Status |
|---|---|---|
| September 2026 | Study design, literature review, plan sets | 🟢 In progress |
| October 2026 | Review interface, study sessions, analysis | ⚪ Planned |
| 13 November 2026 | Paper submitted to HUGS 2027 | ⚪ Planned |
| December 2026 | Unlisted review tool built and tested | ⚪ Planned |

## Repository

```
unlisted/
├── assets/            images used in this README
├── docs/              proposal and poster
├── review-interface/  web app used in the study        (planned)
├── analysis/          scoring and analysis scripts     (planned)
└── improved-tool/     the Unlisted review tool         (planned)
```

Study materials and participant data are not published, to protect the study design and participant privacy.

## Built with

![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PDF.js](https://img.shields.io/badge/PDF.js-E34F26?style=flat-square&logo=mozilla&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)

## Key references

1. C. M. Gray, C. T. Santos, N. Bielova and T. Mildner, "An Ontology of Dark Patterns Knowledge," CHI 2024.
2. R. Parasuraman and D. H. Manzey, "Complacency and Bias in Human Use of Automation," *Human Factors*, 2010.
3. L. J. Skitka, K. L. Mosier and M. Burdick, "Does Automation Bias Decision Making?" *International Journal of Human-Computer Studies*, 1999.
4. Hamppi, "Integrating AI into Procurement Processes in Construction," MSc thesis, Aalto University, 2025.

## About

Capstone project, B.S. in Computer Science, School of Science and Engineering, **Al Akhawayn University**.

**Mehdi [Last name]** · supervised by **Dr. Hoda Khalafalla**

📫 [your university email] · [LinkedIn](https://www.linkedin.com/in/your-profile)
