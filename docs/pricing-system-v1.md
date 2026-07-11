# Pricing System v1

## Plans

### FREE

- 1-day free trial
- 1 AI-generated goal plan
- 10 Mori Energy for AI edits
- Daily schedule
- No payment method required

### PRO — KRW 2,900/month

- Unlimited goals and schedules
- 300 Mori Energy per month
- Weekly review
- Mori growth
- Full history
- Premium widgets
- User-facing promise: “Generous monthly AI assistance”

## Mori Energy costs

| Action | Energy |
| --- | ---: |
| Simple edit | 1 |
| Regenerate today's schedule | 3 |
| Weekly optimization | 5 |
| Full goal redesign | 10 |

Energy resets each month. Unused Energy does not roll over. Show a low-balance warning at 20% remaining or below.

## Extra Energy

| Pack | Price | Revenue per Energy |
| --- | ---: | ---: |
| 100 | KRW 990 | KRW 9.90 |
| 300 | KRW 1,990 | KRW 6.63 |
| 1,000 | KRW 4,900 | KRW 4.90 |

## Unit economics guardrails

- PRO revenue: KRW 2,900/month.
- A gross-margin target above 60% allows total variable cost below KRW 1,160/month.
- An AI-cost target of KRW 1,000/month produces a 65.5% gross margin before payment, messaging, and other variable costs.
- At 60–120 simple edits per month, the average AI cost must remain below KRW 16.67–8.33 per edit to stay within the KRW 1,000 AI budget.
- At the full 300-Energy allowance, blended AI cost must remain below KRW 3.33 per Energy to stay within the same budget.
- The remaining KRW 160 margin buffer is tight. Track payment fees, Kakao messaging costs, retries, and support-related variable costs separately.
- Validate each extra-Energy pack against measured blended cost per Energy. The 1,000-Energy pack has the narrowest margin and should be reviewed first if model costs rise.

## Metrics to monitor

- AI cost per Energy by action type
- Average and 95th-percentile Energy consumption per paid user
- Percentage of users reaching the 20% warning
- Extra-Energy attach rate and gross margin by pack
- Trial-to-PRO conversion rate
- PRO gross margin after payment and messaging costs
